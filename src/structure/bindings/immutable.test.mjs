import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { resolveImmutableValue } from './immutable.mjs';

function value(text, position = -1) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const expression = parsed.sourceFile.statements.at(position)?.expression;
  assert.ok(expression, 'missing alias-use fixture');
  return resolveImmutableValue(expression);
}

test('immutable aliases expose their import origin without evaluating any initializer', () => {
  const result = value("import * as fp from 'footprintjs'; const first = fp.flowChart; const next = first; next;");
  assert.deepEqual(result.origin, { module: 'footprintjs', name: 'flowChart' });
});

test('mutable cyclic and before-initialization aliases stay unknown', () => {
  assert.equal(value('let alias = other; alias;').status, 'unknown');
  assert.equal(value('const first = second; const second = first; first;').status, 'unknown');
  const before = value('alias; const alias = () => {};', 0);
  assert.equal(before.status, 'unknown');
  assert.match(before.reason, /initialization/);
});

test('a property write prevents a const object from proving its original literal receiver', () => {
  assert.equal(value('const graph = {}; graph.addFunction = other; graph;').status, 'unknown');
  assert.equal(value('const graph = {}; mutate(graph); graph;').status, 'unknown');
});

test('imported constructor provenance is unknown after explicit prototype mutation', () => {
  const result = value("import { FlowChartBuilder as Builder } from 'footprintjs'; Builder.prototype.addFunction = other; Builder;");
  assert.equal(result.status, 'unknown');
});
