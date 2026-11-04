import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { measureUnits } from './units.mjs';

test('unit offsets exclude preceding docs and retain nested runtime bodies', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: '// docs\nfunction outer() { function inner() {} }' });
  const { functions } = measureUnits(parsed);
  assert.equal(functions.length, 2);
  assert.equal(parsed.text.slice(functions[0].start, functions[0].end), 'function outer() { function inner() {} }');
  assert.equal(functions[1].identity, 'function:outer.inner');
});

test('signature-only declared classes do not add runtime class debt', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'declare class Port { run(): void; } class Runtime { run() {} }' });
  const result = measureUnits(parsed);
  assert.deepEqual(result.classes.map(item => item.name), ['Runtime']);
  assert.deepEqual(result.functions.map(item => item.name), ['run']);
});
