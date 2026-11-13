// The conditions between the jobs of release-route.yml, evaluated from the YAML (W7 and the
// brief's "who runs when"): every mode, a refused plan, each earlier job failed, skipped or
// cancelled. Two checks: an exhaustive walk against the rule each job is meant to keep, and the
// table in docs/RELEASE-ROUTE.md computed again from the YAML, so the doc cannot drift.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluate, parseCondition } from './support/expression.mjs';
import { readWorkflow, simulate } from './support/route-workflow.mjs';

const { yaml } = readWorkflow('release-route.yml');
const jobs = yaml.jobs;
const LATER = ['hold', 'build', 'publish', 'verify', 'release'];

// What the plan job hands on in each case: a passing plan's outputs (the step's own closed
// alphabets; `compare` as rules.mjs gives it for each mode), or a refusal's names only.
const NAMES = { rule: 'some-rule', commit: 'a'.repeat(40), package: 'footprint-storydeck', version: '0.13.2' };
const MODES = {
  publish: { ...NAMES, node: '22', mode: 'publish', compare: 'yes' },
  recover: { ...NAMES, node: '22', mode: 'recover', compare: 'yes' },
  finish: { ...NAMES, node: '22', mode: 'finish', compare: 'no' },
  'dry-run compare=yes': { ...NAMES, node: '22', mode: 'dry-run', compare: 'yes' },
  'dry-run compare=no': { ...NAMES, node: '22', mode: 'dry-run', compare: 'no' },
  nothing: { ...NAMES, node: '22', mode: 'nothing', compare: 'no' },
};
const RESULTS = ['success', 'failure', 'cancelled'];

// Every world: each plan case, the run cancelled or not, and every result of every job that runs
// (a job that does not run is skipped). Built by walking the jobs in order.
function* worlds() {
  const plans = [
    ...Object.entries(MODES).map(([label, outputs]) => ({ label, plan: { result: 'success', outputs } })),
    { label: 'refused', plan: { result: 'failure', outputs: NAMES } },
    // A plan that passed and a LATER step of its job failed (its record upload): GitHub keeps the
    // step's outputs, mode included. The explicit `needs.plan.result == 'success'` stops it.
    ...Object.entries(MODES).map(([label, outputs]) => ({ label: `${label}, then its job failed`, plan: { result: 'failure', outputs } })),
    { label: 'cancelled', plan: { result: 'cancelled', outputs: {} } },
  ];
  for (const { label, plan } of plans)
    for (const cancelled of [false, true]) {
      const walk = function* (results) {
        const state = simulate(jobs, { cancelled, plan, results });
        const open = LATER.find((id) => state[id].result !== 'skipped' && !Object.hasOwn(results, id));
        if (!open) { yield { label, cancelled, plan, state }; return; }
        for (const result of RESULTS) yield* walk({ ...results, [open]: result });
      };
      yield* walk({});
    }
}

const ok = (state, id) => state[id].result === 'success';
const mode = (world) => (world.plan.result === 'success' ? world.plan.outputs.mode : null);

// The rule each job keeps (docs/RELEASE-ROUTE.md, "The workflows").
const EXPECTED = {
  hold: (w) => !w.cancelled && ['publish', 'dry-run'].includes(mode(w)),
  build: (w) => !w.cancelled && ((['publish', 'dry-run'].includes(mode(w)) && ok(w.state, 'hold')) || mode(w) === 'recover'),
  publish: (w) => !w.cancelled && mode(w) === 'publish' && ok(w.state, 'build'),
  verify: (w) => !w.cancelled && w.plan.result === 'success' && w.plan.outputs.compare === 'yes' && ok(w.state, 'build') &&
    (mode(w) !== 'publish' || ['success', 'failure'].includes(w.state.publish.result)),
  // finish writes only the GitHub release for a tag that exists: no build, no verify, the release job alone.
  release: (w) => !w.cancelled && ((['publish', 'recover'].includes(mode(w)) && ok(w.state, 'verify')) || mode(w) === 'finish'),
};

test('every job but plan starts its condition with !cancelled(), so the condition alone decides', () => {
  assert.deepEqual(Object.keys(jobs), ['plan', ...LATER]);
  assert.equal(jobs.plan.if, undefined);
  for (const id of LATER) {
    const tree = parseCondition(jobs[id].if);
    assert.deepEqual(tree.and[0], { not: { cancelled: true } }, id);
    assert.deepEqual(tree.and[1], { path: 'needs.plan.result', equals: 'success' }, id);
  }
});

test('each job runs exactly when its rule says, in every world (every mode, refused plan, each job failed, skipped or cancelled)', () => {
  let count = 0;
  for (const world of worlds()) {
    count++;
    for (const id of LATER)
      assert.equal(world.state[id].result !== 'skipped', EXPECTED[id](world), `${id} in ${world.label}, cancelled=${world.cancelled}, ${JSON.stringify(Object.fromEntries(LATER.map((j) => [j, world.state[j].result])))}`);
  }
  assert.ok(count > 50, `${count} worlds`);
});

test('no job runs because a job it needs FAILED, except verify after a failed publish (W7)', () => {
  for (const world of worlds())
    for (const id of LATER) {
      if (world.state[id].result === 'skipped') continue;
      for (const need of [jobs[id].needs].flat())
        if (world.state[need].result === 'failure') assert.deepEqual([id, need], ['verify', 'publish'], world.label);
    }
});

test('nothing writes (publish, release) unless the plan PASSED with mode publish, recover or finish; finish runs nothing but the release job', () => {
  for (const world of worlds()) {
    if (world.state.publish.result !== 'skipped') assert.equal(mode(world), 'publish');
    if (world.state.release.result !== 'skipped') assert.ok(['publish', 'recover', 'finish'].includes(mode(world)));
    if (mode(world) === 'finish') assert.deepEqual(LATER.filter((id) => world.state[id].result !== 'skipped'), world.cancelled ? [] : ['release']);
  }
});

// The finish clause's `needs.verify.result == 'skipped'` half (review, workflow-yaml-2 and tests-5):
// the simulator cannot make verify run under finish (verify needs a build), so the walk above cannot
// see it; evaluate the release job's condition directly. A finish plan whose verify somehow ran is
// not a finish the route planned, and the release job must not act on it.
test('the release job runs for finish only with verify skipped', () => {
  const tree = parseCondition(jobs.release.if);
  const plan = { result: 'success', outputs: MODES.finish };
  const runs = (verify) => evaluate(tree, { cancelled: false, needs: { plan, verify: { result: verify, outputs: {} } } });
  assert.equal(runs('skipped'), true);
  for (const verify of ['success', 'failure', 'cancelled']) assert.equal(runs(verify), false, verify);
});

// The table in the doc, computed again. Each row: the case, then whether each later job runs.
const CASES = [
  ['plan refused (exit 1: only the names of the run are written)', { plan: { result: 'failure', outputs: NAMES } }],
  ['plan passed, then a later step of its job failed (outputs kept)', { plan: { result: 'failure', outputs: MODES.publish } }],
  ['the run is cancelled', { cancelled: true, plan: { result: 'success', outputs: MODES.publish } }],
  ['`nothing`', { plan: { result: 'success', outputs: MODES.nothing } }],
  ['`publish`, every job green', { plan: { result: 'success', outputs: MODES.publish } }],
  ['`publish`, hold red', { plan: { result: 'success', outputs: MODES.publish }, results: { hold: 'failure' } }],
  ['`publish`, build red', { plan: { result: 'success', outputs: MODES.publish }, results: { build: 'failure' } }],
  ['`publish`, build cancelled', { plan: { result: 'success', outputs: MODES.publish }, results: { build: 'cancelled' } }],
  ['`publish`, publish red, verify green', { plan: { result: 'success', outputs: MODES.publish }, results: { publish: 'failure' } }],
  ['`publish`, publish red, verify red', { plan: { result: 'success', outputs: MODES.publish }, results: { publish: 'failure', verify: 'failure' } }],
  ['`publish`, publish cancelled', { plan: { result: 'success', outputs: MODES.publish }, results: { publish: 'cancelled' } }],
  ['`publish`, verify red', { plan: { result: 'success', outputs: MODES.publish }, results: { verify: 'failure' } }],
  ['`recover`, every job green', { plan: { result: 'success', outputs: MODES.recover } }],
  ['`recover`, build red', { plan: { result: 'success', outputs: MODES.recover }, results: { build: 'failure' } }],
  ['`recover`, verify red', { plan: { result: 'success', outputs: MODES.recover }, results: { verify: 'failure' } }],
  ['`finish`', { plan: { result: 'success', outputs: MODES.finish } }],
  ['`dry-run`, compare=yes, every job green', { plan: { result: 'success', outputs: MODES['dry-run compare=yes'] } }],
  ['`dry-run`, compare=no, every job green', { plan: { result: 'success', outputs: MODES['dry-run compare=no'] } }],
  ['`dry-run`, hold red', { plan: { result: 'success', outputs: MODES['dry-run compare=yes'] }, results: { hold: 'failure' } }],
];

function truthTableRows() {
  return CASES.map(([label, world]) => {
    const state = simulate(jobs, world);
    return `| ${label} | ${LATER.map((id) => (state[id].result === 'skipped' ? '-' : 'runs')).join(' | ')} |`;
  });
}

test('the truth table in docs/RELEASE-ROUTE.md is the one the YAML gives', () => {
  const doc = readFileSync('docs/RELEASE-ROUTE.md', 'utf8');
  const from = doc.indexOf('<!-- route-truth-table -->');
  const to = doc.indexOf('<!-- /route-truth-table -->');
  assert.ok(from !== -1 && to > from, 'the doc has the marked table');
  const rows = doc.slice(from, to).split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| Case'));
  assert.deepEqual(rows, truthTableRows());
});
