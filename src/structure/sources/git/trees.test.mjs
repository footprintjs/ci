import { test } from 'node:test';
import assert from 'node:assert/strict';
import { treeEntries } from './trees.mjs';

const oid = 'a'.repeat(40);

test('tree parser preserves unusual names and refuses text symlinks', () => {
  assert.equal(treeEntries(Buffer.from(`100644 blob ${oid}\tsrc/a\nb.ts\0`))[0].path, 'src/a\nb.ts');
  assert.throws(() => treeEntries(Buffer.from(`120000 blob ${oid}\tsrc/link.ts\0`)), /symlinks/);
  assert.throws(() => treeEntries(Buffer.from(`100644 blob ${oid}\tsrc/a.ts`)), /terminated/);
  assert.throws(() => treeEntries(Buffer.from([0xff, 0])), /encoded|encoding/i);
});
