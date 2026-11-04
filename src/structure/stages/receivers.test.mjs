import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { receiverKind } from './receivers.mjs';

function receiver(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const expression = parsed.sourceFile.statements.at(-1)?.expression;
  assert.ok(expression, 'missing receiver fixture');
  return receiverKind(expression);
}

test('constructor and fluent branch chains keep their actual builder state', () => {
  const source = "import { FlowChartBuilder as Builder } from 'footprintjs'; new Builder().start('Root', () => {}, 'root').addDeciderFunction('Pick', () => {}, 'pick');";
  assert.equal(receiver(source), 'decider');
});

test('a literal unrelated receiver is distinct from an unresolved factory result', () => {
  assert.equal(receiver('const service = { addFunction() {} }; service;'), 'unrelated');
  assert.equal(receiver('const graph = loadBuilder(); graph;'), 'unknown');
});
