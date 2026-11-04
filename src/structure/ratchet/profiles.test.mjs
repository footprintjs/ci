import assert from 'node:assert/strict';
import test from 'node:test';
import { groupProfiles } from './profiles.mjs';
import { debt } from './index.fixture.mjs';

test('one unit owns its full metric profile without modifying source observations', () => {
  const input = [debt(), debt({ rule: 'complexity', value: 20, limit: 15, excess: 5 })];
  const before = JSON.stringify(input);
  const profiles = groupProfiles(input);
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].byRule.get('complexity').value, 20);
  assert.equal(profiles[0].findings.length, 2);
  assert.equal(JSON.stringify(input), before);
});

test('different units cannot share a profile just because a caller reused an identifier', () => {
  assert.throws(() => groupProfiles([debt(), debt({ identity: 'function:other', rule: 'complexity' })]), TypeError);
});

test('duplicate metrics and inconsistent excess are input errors, never invented debt', () => {
  assert.throws(() => groupProfiles([debt(), debt()]), TypeError);
  assert.throws(() => groupProfiles([debt({ excess: 0 })]), TypeError);
  assert.throws(() => groupProfiles([debt({ value: Infinity })]), TypeError);
  assert.throws(() => groupProfiles([null]), TypeError);
});
