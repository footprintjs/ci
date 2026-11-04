import assert from 'node:assert/strict';
import test from 'node:test';
import { profileObservations } from './observations.mjs';
import { groupProfiles } from './profiles.mjs';
import { matchProfiles } from './match.mjs';
import { debt } from './index.fixture.mjs';

const observe = (head, base) => profileObservations(matchProfiles(groupProfiles(head), groupProfiles(base)));

test('shrinking one unit cannot hide per-unit growth in another', () => {
  const other = debt({ unitId: 'other', identity: 'function:other', bodyHash: 'other' });
  const head = [debt({ value: 61, excess: 1 }), { ...other, value: 75, excess: 15 }];
  const result = observe(head, [debt(), other]);
  assert.equal(result.improved.length, 1);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].unitId, 'other');
  assert.equal(result.regressions[0].reason, 'grown-unit');
});

test('a rule removed from a retained unit is recorded as removed debt', () => {
  const base = [debt(), debt({ rule: 'complexity', value: 20, limit: 15, excess: 5 })];
  const result = observe([debt()], base);
  assert.equal(result.existing.length, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].rule, 'complexity');
});

test('a lower metric cannot hide increased excess from a changed contextual limit', () => {
  const result = observe([debt({ value: 69, limit: 50, excess: 19 })], [debt()]);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.regressions[0].reason, 'grown-unit');
});
