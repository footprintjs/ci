import assert from 'node:assert/strict';
import test from 'node:test';
import { readerReferences } from './readers.mjs';
import { parseSource } from '../syntax/parse.mjs';

test('namespace aliases and import-relative URLs prove paths but leave reader intent unverified', () => {
  const parsed = parseSource({ path: 'test/read.ts', text: "import * as fs from 'node:fs'; const files = fs; files.readFileSync(new URL('../src/owner.ts', import.meta.url));" });
  const result = readerReferences(parsed);
  assert.deepEqual(result.references.map(item => item.target), ['src/owner.ts']);
  assert.equal(result.unverified.length, 1);
  assert.equal(result.unverified[0].kind, 'source-reader');
  assert.match(result.unverified[0].reason, /intent|ownership/);
});

test('static import URLs decode path text without turning URL fragments into filenames', () => {
  const parsed = parseSource({ path: 'test/read.ts', text: "import { readFileSync } from 'node:fs'; readFileSync(new URL('../src/a%20b.ts#note', import.meta.url));" });
  const result = readerReferences(parsed);
  assert.equal(result.references[0]?.target, 'src/a b.ts');
  assert.equal(result.references[0]?.exact, true);
});

test('root-relative literals normalize while mutable reader aliases stay unverified', () => {
  const literal = parseSource({ path: 'test/read.ts', text: "import { readFileSync } from 'node:fs'; readFileSync('./src/missing.ts');" });
  assert.equal(readerReferences(literal).references[0]?.target, 'src/missing.ts');
  const mutable = parseSource({ path: 'test/read.ts', text: "import * as fs from 'node:fs'; let read = fs.readFileSync; read(dynamic);" });
  const result = readerReferences(mutable);
  assert.deepEqual(result.references, []);
  assert.ok(result.unverified.some(item => item.kind === 'source-reader'));
});

test('a local function sharing a filesystem reader name is not a reader import', () => {
  const parsed = parseSource({ path: 'test/read.ts', text: "function readFileSync(value) { return value; } readFileSync('src/data-only.ts');" });
  assert.deepEqual(readerReferences(parsed), { references: [], unverified: [] });
});
