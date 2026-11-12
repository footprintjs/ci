// The two route workflows, read once with the strict YAML subset, and the small vocabulary the
// tests share: the pins this repository uses, the tool guard, and the run simulator that turns
// the jobs' `if:` conditions into which jobs run.
import { readFileSync } from 'node:fs';
import { evaluate, parseCondition } from './expression.mjs';
import { parseYaml } from './yaml-subset.mjs';

export const readWorkflow = (name) => {
  const text = readFileSync(`.github/workflows/${name}`, 'utf8');
  return { text, yaml: parseYaml(text) };
};

// Every action the route workflows use, by full commit, with the release the commit belongs to
// (the comment beside each `uses:`). checkout, setup-node and upload-artifact are the pins the
// other workflows of this repository already use; download-artifact is new here: v4.3.0 is the
// newest v4 release, and its commit was read from the GitHub API (repos/actions/download-artifact/
// commits/v4.3.0), as were the other three (v4.2.2, v4.4.0, v4.6.2).
export const PINS = Object.freeze({
  'actions/checkout': ['11bd71901bbe5b1630ceea73d27597364c9af683', 'v4.2.2'],
  'actions/setup-node': ['49933ea5288caeca8642d1e84afbd3f7d6820020', 'v4.4.0'],
  'actions/upload-artifact': ['ea165f8d65b6e75b540449e92b4886f43607fa02', 'v4.6.2'],
  'actions/download-artifact': ['d3f86a106a0bac45b974a628896c90dbdf5c8093', 'v4.3.0'],
});

// The hold check's step form, from the tool checkout at this workflow's commit (a local action
// path resolves against the runner's workspace, where the tool was checked out as `tool`).
export const HOLD_ACTION = './tool/.github/actions/hold';

export const TOOL_GUARD = Object.freeze({
  name: 'Refuse a tool commit that is not 40 lowercase hex',
  env: { ROUTE_TOOL_SHA: '${{ job.workflow_sha }}' },
  run: '[[ "$ROUTE_TOOL_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Refused: the tool commit (job.workflow_sha) is not 40 lowercase hex."; exit 1; }\n',
});

export const isCheckout = (step) => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@');
export const isToolCheckout = (step) => isCheckout(step) && step.with?.repository === 'footprintjs/ci';
export const stepNamed = (job, name) => {
  const found = job.steps.filter((step) => step.name === name);
  if (found.length !== 1) throw new Error(`${found.length} steps named ${name}`);
  return found[0];
};

// Every value of a document, with where it sits: [path, value] for each scalar.
export function* leaves(value, path = []) {
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) yield* leaves(child, [...path, key]);
  } else yield [path, value];
}

// Which jobs run, and with which result, for one world:
//   { cancelled, plan: { result, outputs }, results: { job: result when it runs } }
// A job whose `if:` is true runs and ends with results[job] (default success); otherwise it is
// skipped. The plan job has no condition. Every other job's condition starts with !cancelled(),
// so the condition alone decides (no implied success(); release-route.test.mjs pins that).
export function simulate(jobs, world) {
  const state = {};
  for (const [id, job] of Object.entries(jobs)) {
    if (id === 'plan') { state.plan = world.plan; continue; }
    const needs = Object.fromEntries([job.needs].flat().map((need) => [need, state[need]]));
    const runs = evaluate(parseCondition(job.if), { cancelled: world.cancelled === true, needs });
    state[id] = runs ? { result: world.results?.[id] ?? 'success', outputs: {} } : { result: 'skipped', outputs: {} };
  }
  return state;
}
