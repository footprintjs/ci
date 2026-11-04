import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { registerDeclaration } from './declarations.mjs';

test('var belongs to its function body while a block const belongs to the block', () => {
  const body = { kind: 'body', parent: null, names: new Map() };
  const block = { kind: 'block', parent: body, names: new Map() };
  const parsed = parseSource({ path: 'src/a.ts', text: 'var hoisted = 1; const local = 2;' });
  for (const statement of parsed.sourceFile.statements) registerDeclaration(statement.declarationList.declarations[0], block);
  assert.ok(body.names.has('hoisted'));
  assert.ok(!block.names.has('hoisted'));
  assert.ok(block.names.has('local'));
  assert.ok(!body.names.has('local'));
});
