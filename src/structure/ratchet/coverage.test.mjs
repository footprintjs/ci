import assert from 'node:assert/strict';
import test from 'node:test';
import { matchingCoverage } from './coverage.mjs';
import { matchProfiles } from './match.mjs';
import { groupProfiles } from './profiles.mjs';
import { debt } from './index.fixture.mjs';

function coverage(headFindings, baseFindings) {
  const base = groupProfiles(baseFindings);
  return matchingCoverage({ matching: matchProfiles(groupProfiles(headFindings), base), base });
}

test('genuinely new debt with no old unit has no fabricated extraction credit', () => {
  assert.deepEqual(coverage([debt()], []), { complete: true, unverified: [] });
});

test('unmatched renamed debt exposes extraction as unimplemented', () => {
  const result = coverage([debt({ identity: 'function:extracted', unitId: 'new' })], [debt()]);
  assert.equal(result.complete, false);
  assert.equal(result.unverified.length, 1);
  assert.equal(result.unverified[0].kind, 'extracted-debt');
});

test('duplicate matching identities expose ambiguity rather than claim compliance', () => {
  const result = coverage([debt({ unitId: 'new:a' }), debt({ unitId: 'new:b' })], [debt()]);
  assert.equal(result.complete, false);
  assert.equal(result.unverified.length, 2);
  assert.ok(result.unverified.every(item => item.kind === 'ratchet-identity'));
});
