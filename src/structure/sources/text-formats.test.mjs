import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceTextPath } from './text-formats.mjs';

test('reference documents have one case-insensitive format boundary', () => {
  for (const extension of ['md', 'mdx', 'markdown', 'rst', 'txt', 'adoc']) {
    assert.equal(referenceTextPath(`docs/guide.${extension.toUpperCase()}`), true, extension);
  }
  for (const path of ['image.bin', 'guide.pdf', 'note.txt.png', 'src/entry.ts']) {
    assert.equal(referenceTextPath(path), false, path);
  }
});
