import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { isValueReference } from './references.mjs';

test('a destructuring default is a value use while its local name and property key are bindings', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const { source: local = fallback } = input;' });
  const element = parsed.sourceFile.statements[0].declarationList.declarations[0].name.elements[0];
  assert.equal(isValueReference(element.initializer), true);
  assert.equal(isValueReference(element.name), false);
  assert.equal(isValueReference(element.propertyName), false);
});
