import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { bindingUses } from './uses.mjs';

const parsed = text => parseSource({ path: 'src/a.ts', text });
const variable = (source, index) => source.sourceFile.statements[index].declarationList.declarations[0];

test('one immutable source snapshot reuses the identifier index while different text remains independent', () => {
  const first = parsed('const graph = {}; graph;');
  const second = parsed('const graph = {}; graph.x = 1;');
  assert.equal(bindingUses(first.sourceFile), bindingUses(first.sourceFile));
  assert.notEqual(bindingUses(first.sourceFile), bindingUses(second.sourceFile));
  assert.equal(bindingUses(first.sourceFile).writes.has(variable(first, 0)), false);
  assert.equal(bindingUses(second.sourceFile).writes.has(variable(second, 0)), true);
});

test('writes and escapes include const alias owners while value uses retain exact lexical bindings', () => {
  const source = parsed('const graph = {}; const alias = graph; alias.x = 1; consume(alias); graph;');
  const graph = variable(source, 0);
  const alias = variable(source, 1);
  const result = bindingUses(source.sourceFile);
  assert.equal(result.writes.has(graph), true);
  assert.equal(result.writes.has(alias), true);
  assert.equal(result.escapeOffsets.get(graph), source.text.indexOf('alias.x'));
  assert.equal(result.escapeOffsets.get(alias), source.text.indexOf('alias.x'));
  assert.equal(result.valueUses.get(graph)?.length, 2);
});

test('same-spelled shadow bindings and contained direct calls do not pollute an outer handle', () => {
  const source = parsed('const graph = {}; function inner(graph) { consume(graph); graph.x++; } graph.run(); graph;');
  const graph = variable(source, 0);
  const result = bindingUses(source.sourceFile);
  assert.equal(result.writes.has(graph), false);
  assert.equal(result.escapeOffsets.has(graph), false);
  assert.equal(result.valueUses.get(graph)?.length, 2);
});

test('mutable aliases do not pass writes back to their original initializer', () => {
  const source = parsed('const graph = {}; let alias = graph; alias.x = 1; consume(alias); graph;');
  const graph = variable(source, 0);
  const alias = variable(source, 1);
  const result = bindingUses(source.sourceFile);
  assert.equal(result.writes.has(alias), true);
  assert.equal(result.writes.has(graph), false);
  assert.ok(result.escapeOffsets.has(graph), 'the mutable initializer itself is an escape, as before');
});
