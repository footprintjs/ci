import assert from 'node:assert/strict';
import test from 'node:test';
import { LIMITS } from './limits.mjs';

test('a checked repository cannot mutate the pinned limits in memory', () => {
  const original = LIMITS.functionLines;
  assert.throws(() => { LIMITS.functionLines = Infinity; }, TypeError);
  assert.equal(LIMITS.functionLines, original);
});
