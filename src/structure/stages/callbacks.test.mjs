import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { collectCallbacks } from './callbacks.mjs';

function callbacks(text, mode) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const expression = parsed.sourceFile.statements.at(-1)?.expression;
  assert.ok(expression, 'missing callback expression fixture');
  return collectCallbacks(expression, mode);
}

test('both pausable halves and optional list entries are discovered independently', () => {
  const handler = callbacks('({ execute() {}, resume: () => {} });', 'handler');
  assert.equal(handler.nodes.length, 2);
  assert.deepEqual(handler.reasons, []);
  const list = callbacks('[{ id: "empty" }, { id: "absent", fn: undefined }, { id: "work", fn() {} }];', 'list');
  assert.equal(list.nodes.length, 1);
  assert.deepEqual(list.reasons, []);
});

test('literal spreads remain incomplete rather than manufacturing known callbacks', () => {
  assert.ok(callbacks('({ ...handler });', 'handler').reasons.length > 0);
  assert.ok(callbacks('[...entries];', 'list').reasons.length > 0);
});

test('an ambiguous local undefined binding is not an absent optional callback', () => {
  const result = callbacks('var undefined = local; var undefined; [{ id: "work", fn: undefined }];', 'list');
  assert.ok(result.reasons.length > 0);
});
