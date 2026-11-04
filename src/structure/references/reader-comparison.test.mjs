import assert from 'node:assert/strict';
import test from 'node:test';
import { observeSnapshotContext } from '../check/snapshot.mjs';
import { readerComparison } from './reader-comparison.mjs';

const context = files => observeSnapshotContext({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });

test('base-only literal candidates retain old reader evidence without adding a head count', () => {
  const before = context({ 'src/owner.ts': 'function work() {}',
    'test/removed.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts');" });
  const after = context({ 'src/owner.ts': '' });
  const result = readerComparison(after, before);
  assert.equal(result.current.sourceReaders.unverifiedCount, 0);
  assert.equal(result.current.sourceReaders.baseUnverifiedCount, 1);
  assert.deepEqual(result.current.sourceReaders.analyzedPaths, []);
  assert.deepEqual(result.current.sourceReaders.baseAnalyzedPaths, ['test/removed.ts']);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
