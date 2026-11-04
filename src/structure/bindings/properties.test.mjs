import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { literalProperties } from './properties.mjs';

test('literal callback fields are visible and spread/accessor ambiguity is explicit', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: '({ execute() {}, resume: callback, ...other, get dynamic() { return callback; } });' });
  const result = literalProperties(parsed.sourceFile.statements[0].expression.expression);
  assert.ok(result.properties.has('execute'));
  assert.ok(result.properties.has('resume'));
  assert.equal(result.unverified.length, 2);
});
