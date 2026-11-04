import assert from 'node:assert/strict';
import test from 'node:test';
import { compareReplay } from './compare.mjs';
import { ids, entry } from './testing.fixture.mjs';

test('comparison reports conflict-only mode and deletion changes explicitly', () => {
  const result = compareReplay({ tree: ids.different }, { tree: ids.tree, status: 'conflicted', conflictPaths: ['a'] },
    { expected: [entry('a'), entry('b')], actual: [entry('a', ids.blob, '100755')] });
  assert.deepEqual(result.findings.map(item => item.path), ['b']);
  assert.deepEqual(result.differences.map(item => item.path), ['a', 'b']);
});
