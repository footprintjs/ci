import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { lexicalScope } from './scopes.mjs';

test('parameter initializers do not see var declarations from the separate body environment', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const value = 1; function work(arg = value) { var value = 2; }' });
  const reference = parsed.sourceFile.statements[1].parameters[0].initializer;
  const parameters = lexicalScope(reference);
  assert.equal(parameters.kind, 'parameters');
  assert.ok(!parameters.names.has('value'));
  assert.ok(parameters.parent.names.has('value'));
});
