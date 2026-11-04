import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';

test('an empty tracked snapshot has a complete JSON-only advisory observation', () => {
  const result = checkStructure({ id: 'empty', files: [] });
  assert.deepEqual(result.findings, []);
  assert.equal(result.coverage.complete, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
