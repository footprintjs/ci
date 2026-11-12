// The decision's two edges, end to end through the charted plan step: a decision no rule matches
// takes the default branch, which refuses (exit 1, no mode); and a state that holds a mode AND a
// refusal is a refusal (the refusal wins, exit 1).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAN_STAGES } from '../../../src/release-route/chart/plan-chart.mjs';
import { chartResult } from '../../../src/release-route/chart/plan-run.mjs';
import { FACT_NAMES } from '../../../src/release-route/chart/state.mjs';
import { RESULTS } from '../../../src/release-route/chart/stages/result.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { storydeckDoors } from '../storydeck-today.mjs';
import { runWithStages } from './stand-in.mjs';

async function plan(stages) {
  const written = {};
  const printed = [];
  const report = createReport({ env: { GITHUB_OUTPUT: 'out' }, print: (line) => printed.push(line), append: (path, text) => { written[path] = (written[path] ?? '') + text; } });
  const code = await runWithStages('plan', stages, { ...storydeckDoors(), report, argv: [] });
  return { code, printed, output: written.out ?? '' };
}

// A weigh stage that leaves every fact, and factsReadable, at a value no rule tests for.
const noRuleMatches = { ...PLAN_STAGES.weigh, make: () => (scope) => {
  for (const name of FACT_NAMES) scope[name] = 'unknown';
  scope.factsReadable = 'unknown';
} };

test('no rule matches: the default branch refuses no-rule-matched, exit 1, and no mode is written', async () => {
  const result = await plan({ ...PLAN_STAGES, weigh: noRuleMatches });
  assert.equal(result.code, 1);
  assert.ok(result.printed.some((line) => line.startsWith('Refused: no-rule-matched.')), result.printed.join('\n'));
  assert.doesNotMatch(result.output, /^(mode|compare)=/m);
  assert.match(result.output, /^rule=no-rule-matched$/m);
});

test('a state with a mode and a refusal is a refusal: the refusal wins and the step exits 1', async () => {
  assert.equal(chartResult({ rule: 'publish', mode: 'publish', compare: 'yes', refusal: 'release-unfinished' }).refuse, 'release-unfinished');
  assert.equal(chartResult({ rule: 'publish', mode: 'publish', compare: 'yes', refusal: 'release-unfinished' }).mode, undefined);
  // The branch that runs today ('released') also writes a refusal: the step must refuse.
  const both = RESULTS.map((stage) => ({ ...stage, make: () => (scope) => { stage.make()(scope); scope.refusal = 'release-unfinished'; } }));
  const result = await plan({ ...PLAN_STAGES, results: both });
  assert.equal(result.code, 1);
  assert.ok(result.printed.some((line) => line.startsWith('Refused: release-unfinished.')), result.printed.join('\n'));
  assert.doesNotMatch(result.output, /^(mode|compare)=/m);
});
