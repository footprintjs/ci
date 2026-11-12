// A step reads only its doors' OWN properties (step-common.mjs · runHandlers), and the stages a
// chart runs are not a door: the shipped steps always run the real stages. So neither a name set
// on Object.prototype nor an extra property on the doors can stand in for a stage or change the
// bounded wait. Before this, `chartPlanStep({ …, stages })` read `stages` through the prototype
// chain, and an off-main run came out `mode=publish`, exit 0 (second read, round 2, R2-N1).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { PLAN_STAGES } from '../../../src/release-route/chart/plan-chart.mjs';
import { runStep } from '../../../src/release-route/command.mjs';
import { integrityOf } from '../../../src/release-route/registry.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { storydeckDoors } from '../storydeck-today.mjs';
import { bytes, fakeFetch, json } from '../fake-fetch.mjs';

// Result stages that say publish whatever was decided.
const FORGED = { ...PLAN_STAGES, results: PLAN_STAGES.results.map((stage) => ({ ...stage, make: () => (scope) => {
  scope.rule = stage.id;
  scope.mode = 'publish';
  scope.compare = 'yes';
} })) };

function withInherited(t, name, value) {
  Object.defineProperty(Object.prototype, name, { value, configurable: true, writable: true });
  t.after(() => { delete Object.prototype[name]; });
}

async function plan(doors) {
  const written = {};
  const report = createReport({ env: { GITHUB_OUTPUT: 'out' }, print: () => {}, append: (path, text) => { written[path] = (written[path] ?? '') + text; } });
  const code = await runChartStep('plan', { ...doors, report, sleep: async () => {}, argv: [] });
  return { code, output: written.out ?? '' };
}

// storydeck 0.13.1, released, run from a branch: the real decision is rule released, mode nothing.
const OFF_MAIN = { extra: { GITHUB_REF: 'refs/heads/x' } };

test('stages set on Object.prototype are not read: the real stages decide', async (t) => {
  withInherited(t, 'stages', FORGED);
  const result = await plan(storydeckDoors(OFF_MAIN));
  assert.equal(result.code, 0);
  assert.match(result.output, /^rule=released$/m);
  assert.match(result.output, /^mode=nothing$/m);
});

test('stages given as a door are not read either: the shipped step always runs the real stages', async () => {
  const result = await plan({ ...storydeckDoors(OFF_MAIN), stages: FORGED });
  assert.match(result.output, /^mode=nothing$/m);
});

test('a door set on Object.prototype is not a door: an inherited report, git or fetch is never used', async (t) => {
  const used = [];
  withInherited(t, 'fetcher', async () => { used.push('fetcher'); throw new Error('inherited'); });
  const { env, git } = storydeckDoors();
  const result = await plan({ env, git });
  assert.deepEqual(used, []);
  assert.equal(result.code, 1, 'with no fetch door, the facts npm and GitHub give are unreadable');
});

const NAME = 'footprint-storydeck';
const V = `https://registry.npmjs.org/${NAME}/0.13.1`;
const T = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.1.tgz`;
const built = Buffer.from('the built tarball');

for (const [label, runner] of [['plain', runStep], ['charted', runChartStep]])
  test(`${label} verify: a wait set on Object.prototype is not read; the bounded wait is the route's own`, async (t) => {
    const intake = mkdtempSync(join(tmpdir(), 'route-doors-'));
    t.after(() => rmSync(intake, { recursive: true, force: true }));
    mkdirSync(join(intake, 'tarball'));
    writeFileSync(join(intake, 'tarball', 'package.tgz'), built);
    withInherited(t, 'wait', { tries: 0, delayMs: 0 });
    const routes = { [V]: json({ name: NAME, version: '0.13.1', dist: { integrity: integrityOf(built), tarball: T } }), [T]: bytes(built) };
    const printed = [];
    const report = createReport({ env: {}, print: (line) => printed.push(line), append: () => {} });
    const env = { ROUTE_PACKAGE: NAME, ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: join(intake, 'tarball') };
    const code = await runner('verify', { env, fetcher: fakeFetch(routes).fetcher, sleep: async () => {}, report, argv: [] });
    assert.equal(code, 0, printed.join('\n'));
    assert.match(printed.at(-1) ?? '', /^Verified: npm serves|^Record:/);
  });
