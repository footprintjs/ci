import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { escapedBefore } from './escapes.mjs';

function escaped(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const declaration = parsed.sourceFile.statements[0].declarationList.declarations[0];
  const reference = parsed.sourceFile.statements.at(-1)?.expression;
  assert.ok(reference, 'missing use after escape fixture');
  return escapedBefore(declaration, reference);
}

test('prior external argument escapes invalidate a handle through its const alias', () => {
  assert.equal(escaped('const graph = {}; const alias = graph; mutate(alias); graph;'), true);
  assert.equal(escaped('const graph = {}; const holder = { graph }; graph;'), true);
});

test('a direct receiver call and local const alias alone do not invent an external escape', () => {
  assert.equal(escaped('const graph = {}; const alias = graph; graph.addFunction(); graph;'), false);
});
