import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAllowances } from './allowances.mjs';
import { debt } from './index.fixture.mjs';

function apply(rule, delta, policy) {
  const item = debt({ rule, path: 'src/new.ts', unitId: 'new' });
  const observations = { regressions: [item], existing: [], improved: [], removed: [] };
  const result = applyAllowances(observations, [{ rule, baseExcess: 20, headExcess: 20 + delta,
    delta, regressed: delta > 0 }], policy);
  return { ...result, observations };
}

test('moved-file credit requires strict rule improvement and does not cover citation debt', () => {
  const policy = { movedFiles: new Map([['src/new.ts', [{ name: 'work' }]]]) };
  assert.equal(apply('file-code-lines', -1, policy).observations.regressions.length, 0);
  for (const delta of [0, 1]) assert.equal(apply('file-code-lines', delta, policy).observations.regressions.length, 1);
  assert.equal(apply('stale-path', -1, policy).observations.regressions.length, 1);
});

test('wiring totals keep raw growth visible without inventing another total regression', () => {
  const policy = { wiring: new Map([['src/new.ts', { allowedGrowth: 2, codeLines: 90, previousCodeLines: 100 }]]) };
  const result = apply('direct-imports', 2, policy);
  assert.equal(result.observations.existing[0].matchKind, 'split-wiring');
  assert.equal(result.totals[0].delta, 2);
  assert.equal(result.totals[0].effectiveDelta, 0);
  assert.equal(result.totals[0].regressed, false);
});

test('another wiring allowance cannot turn raw total growth into whole-leaf credit', () => {
  const policy = { movedFiles: new Map([['src/new.ts', [{ name: 'work' }]]]),
    wiring: new Map([['src/facade.ts', { allowedGrowth: 10 }]]) };
  assert.equal(apply('direct-imports', 5, policy).observations.regressions.length, 1);
});
