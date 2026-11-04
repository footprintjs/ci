import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { patternBindings } from './patterns.mjs';

test('patterns bind nested local names and rest without binding property keys', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const { source: local, nested: { pick }, ...rest } = input;' });
  const declaration = parsed.sourceFile.statements[0].declarationList.declarations[0];
  const bindings = patternBindings(declaration.name, declaration);
  assert.deepEqual(bindings.map(item => item.name), ['local', 'pick', 'rest']);
  assert.ok(bindings.every(item => item.declaration));
});
