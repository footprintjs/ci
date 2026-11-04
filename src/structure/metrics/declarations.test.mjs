import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { measureDeclarations } from './declarations.mjs';

test('destructured module state and public aliases remain distinguishable', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'let { a, b: other } = value; function local() { let hidden; } export { other as chosen };' });
  const result = measureDeclarations(parsed.sourceFile);
  assert.deepEqual(result.topLevelLets.map(item => item.name), ['a', 'other']);
  assert.deepEqual(result.exports.map(item => [item.name, item.kind]), [['chosen', 'alias']]);
});
