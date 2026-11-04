import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalEntries } from './entries.mjs';
import { entry, ids } from './testing.fixture.mjs';

test('canonical entries retain modes types symlinks gitlinks and empty trees in path order', () => {
  const values = [entry('z', ids.blob, '160000', 'commit'), entry('a', ids.blob, '120000'), entry('empty', ids.blob, '040000', 'tree')];
  assert.deepEqual(canonicalEntries(values, 40), [values[1], values[2], values[0]]);
});
for (const entries of [[entry('a'), entry('a')], [entry('a'), entry('a/child')],
  [entry('x', ids.blob, '040000', 'blob')], [entry('/x')], [entry('a/../b')], [entry('a', 'a'.repeat(64))]]) {
  test('malformed or incoherent entry data is rejected', () => assert.throws(() => canonicalEntries(entries, 40), Error));
}
