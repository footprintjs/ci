import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove, changeFile } from './testing.fixture.mjs';

test('matching malformed source cannot yield complete syntax proof', () => {
  const input = simpleMove();
  for (const snapshot of [input.base, input.head]) changeFile(snapshot, 'src/index.ts', () => 'function broken( {');
  const result = verifyMove(input);
  assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.some(item => item.kind === 'parse-error'));
});
