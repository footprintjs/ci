import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFiles } from './files.mjs';

const files = rows => new Map(Object.entries(rows).map(([path, text]) => [path, { path, text }]));

test('the shared parser policy reuses every supplied source, including declaration readers', () => {
  const input = files({ 'src/value.ts': 'export const value=1;', 'src/value.d.ts': 'declare const value: number;',
    'test/reader.mjs': "import fs from 'node:fs';" });
  const first = parseFiles(input);
  const shared = parseFiles(input, first);
  assert.deepEqual([...shared.keys()], ['src/value.ts', 'src/value.d.ts', 'test/reader.mjs']);
  assert.equal(new Set([...first.values(), ...shared.values()]).size, 3);
});

test('sharing requires both path and full text and is never an ambient global cache', () => {
  const input = files({ 'src/a.ts': 'export const value=1;' });
  const first = parseFiles(input);
  assert.ok(parseFiles(input).get('src/a.ts') !== first.get('src/a.ts'));
  const next = parseFiles(files({ 'src/a.ts': 'export const value=2;', 'src/b.ts': 'export const value=1;' }), first);
  assert.ok(next.get('src/a.ts') !== first.get('src/a.ts'));
  assert.ok(next.get('src/b.ts') !== first.get('src/a.ts'));
  assert.equal(next.get('src/a.ts').tokens.find(token => token.text === '2')?.text, '2');
});
