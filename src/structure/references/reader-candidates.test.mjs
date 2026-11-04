import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { readerCandidatePaths } from './reader-candidates.mjs';

const sources = files => new Map(Object.entries(files).map(([path, text]) => [path, parseSource({ path, text })]));
const lost = new Map([['src/owner.ts', ['work']]]);

test('literal candidates include root/file-relative and escaped strings in source or tests', () => {
  const parsed = sources({ 'test/read.ts': "const path = '../src/owner.ts';",
    'src/read.ts': "const path = 'src/own\\u0065r.ts';", 'scripts/read.mjs': "const path = './src/owner.ts';" });
  assert.deepEqual(readerCandidatePaths(parsed, lost), ['scripts/read.mjs', 'src/read.ts', 'test/read.ts']);
});

test('comments, constructed strings and unrelated literals do not enable reader analysis', () => {
  const parsed = sources({ 'test/a.ts': "// src/owner.ts\nconst path = 'src/' + 'owner.ts';",
    'test/b.ts': "const path = 'other/owner.ts';", 'test/c.ts': 'readFileSync(dynamic);' });
  assert.deepEqual(readerCandidatePaths(parsed, lost), []);
  assert.deepEqual(readerCandidatePaths(parsed, new Map()), []);
});
