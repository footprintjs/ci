import assert from 'node:assert/strict';
import test from 'node:test';
import { compareFindings } from './compare.mjs';
import { debt } from './index.fixture.mjs';

test('the public comparison is JSON-only and keeps every metric on its matched old unit', () => {
  const base = [debt(), debt({ rule: 'complexity', value: 20, limit: 15, excess: 5 })];
  const head = base.map(item => ({ ...item, unitId: 'moved', path: 'src/moved.ts' }));
  const result = compareFindings(head, base);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.existing.length, 2);
  assert.ok(result.existing.every(item => item.baseUnitId === base[0].unitId));
  assert.ok(result.totals.every(item => !item.regressed));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('uncalibrated extraction remains a visible conservative regression', () => {
  const result = compareFindings([debt({ identity: 'function:extracted', unitId: 'new' })], [debt()]);
  assert.equal(result.regressions.length, 1);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.coverage.unverified[0].kind, 'extracted-debt');
  assert.equal(result.removed.length, 1);
});
