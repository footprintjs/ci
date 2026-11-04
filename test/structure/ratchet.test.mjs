import assert from 'node:assert/strict';
import test from 'node:test';
import { compareFindings } from '../../src/structure/ratchet/index.mjs';
import { debt } from './fixtures.mjs';

test('unchanged named debt is existing, not new', () => {
  const result = compareFindings([debt()], [debt()]);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.existing.length, 1);
});

test('a moved same-name unit retains its old debt', () => {
  const head = debt({ path: 'src/moved.ts', unitId: 'src/moved.ts:0:function' });
  assert.equal(compareFindings([head], [debt()]).regressions.length, 0);
});

test('a growing old violation is a regression', () => {
  const head = debt({ value: 71, excess: 11, bodyHash: 'changed' });
  assert.ok(compareFindings([head], [debt()]).regressions.length > 0);
});

test('new oversized code cannot create baseline debt', () => {
  assert.ok(compareFindings([debt()], []).regressions.length > 0);
});

test('one old name cannot excuse two head units', () => {
  const extra = debt({ path: 'src/extra.ts', unitId: 'src/extra.ts:0:function' });
  assert.ok(compareFindings([debt(), extra], [debt()]).regressions.length > 0);
});

test('shrinking an old violation is an improvement', () => {
  const head = debt({ value: 65, excess: 5, bodyHash: 'shrunk' });
  const result = compareFindings([head], [debt()]);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.improved.length, 1);
});

test('removing old debt is recorded', () => {
  assert.equal(compareFindings([], [debt()]).removed.length, 1);
});

test('metrics from different old units cannot be mixed to hide growth', () => {
  const other = { unitId: 'src/other.ts:0:function', path: 'src/other.ts', bodyHash: 'other' };
  const base = [debt(), debt({ ...other, rule: 'complexity', value: 20, limit: 15, excess: 5 })];
  const head = [debt(), debt({ rule: 'complexity', value: 20, limit: 15, excess: 5 })];
  assert.ok(compareFindings(head, base).regressions.length > 0);
});
