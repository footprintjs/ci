import assert from 'node:assert/strict';
import test from 'node:test';
import { ruleTotals, totalRegressions } from './totals.mjs';
import { groupProfiles } from './profiles.mjs';
import { debt } from './index.fixture.mjs';

test('total excess stays separated by rule including entirely removed debt', () => {
  const base = groupProfiles([debt(), debt({ rule: 'complexity', value: 20, limit: 15, excess: 5 })]);
  const head = groupProfiles([debt({ value: 65, excess: 5 })]);
  assert.deepEqual(ruleTotals(head, base), [
    { rule: 'complexity', baseExcess: 5, headExcess: 0, delta: -5, regressed: false },
    { rule: 'function-lines', baseExcess: 10, headExcess: 5, delta: -5, regressed: false },
  ]);
});

test('a growing rule total receives an explicit regression when not already surfaced', () => {
  const head = groupProfiles([debt()]);
  const totals = ruleTotals(head, []);
  const result = totalRegressions({ totals, head, observations: { regressions: [] } });
  assert.equal(result.length, 1);
  assert.equal(result[0].reason, 'total-excess');
  assert.equal(result[0].value, 10);
  assert.equal(result[0].limit, 0);
});

test('an existing same-rule regression is not duplicated by its aggregate', () => {
  const head = groupProfiles([debt()]);
  const result = totalRegressions({ totals: ruleTotals(head, []), head,
    observations: { regressions: [{ rule: 'function-lines' }] } });
  assert.deepEqual(result, []);
});
