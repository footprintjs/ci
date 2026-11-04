import assert from 'node:assert/strict';
import test from 'node:test';
import { measureSource } from './measure.mjs';

function observed(text, path = 'src/view.tsx') {
  const result = measureSource({ path, text });
  assert.ok(result && Array.isArray(result.functions), 'missing function metrics');
  assert.ok(Array.isArray(result.classes), 'missing class metrics');
  assert.deepEqual(result.diagnostics, [], 'fixture must have valid source syntax');
  return result;
}

function unit(result, name, identity, category = 'functions') {
  const found = result[category].find(item => item.name === name && item.identity === identity);
  assert.ok(found, `missing ${category} metric: ${identity}`);
  return found;
}

test('a parameter default arrow keeps its binding name and own JSX eligibility', () => {
  const result = observed('function outer(View = () => <p />) { return View; }');
  const view = unit(result, 'View', 'arrow:outer.View');
  assert.equal(view.jsx, true);
  assert.equal(unit(result, 'outer', 'function:outer').jsx, false);
});

test('a parameter default anonymous function expression has the parameter carrier name', () => {
  const result = observed('function outer(View = function () { return <p />; }) { return View; }');
  assert.equal(unit(result, 'View', 'function:outer.View').jsx, true);
});

test('a lowercase parameter carrier does not gain PascalCase JSX eligibility', () => {
  const result = observed('function outer(view = () => <p />) { return view; }');
  assert.equal(unit(result, 'view', 'arrow:outer.view').jsx, false);
});

test('an explicit function-expression name still takes precedence over its default carrier', () => {
  const result = observed('function outer(View = function Actual() { return <p />; }) { return View; }');
  assert.equal(unit(result, 'Actual', 'function:outer.Actual').jsx, true);
});

test('an object binding default arrow keeps the local identifier', () => {
  const result = observed('const { View = () => <p /> } = options;');
  assert.equal(unit(result, 'View', 'arrow:View').jsx, true);
});

test('a renamed object binding uses its local name rather than the source property', () => {
  const result = observed('const { render: View = () => <p /> } = options;');
  assert.equal(unit(result, 'View', 'arrow:View').jsx, true);
  assert.deepEqual(result.functions.filter(item => item.name === 'render'), []);
});

test('an array binding default arrow has the bound identifier name', () => {
  const result = observed('const [View = () => <p />] = options;');
  assert.equal(unit(result, 'View', 'arrow:View').jsx, true);
});

test('a binding-element default in a destructured parameter retains the function owner', () => {
  const result = observed('function outer({ View = () => <p /> } = options) { return View; }');
  assert.equal(unit(result, 'View', 'arrow:outer.View').jsx, true);
});

test('sibling namespace functions have source-bound distinct qualified identities', () => {
  const result = observed('namespace Left { export function read() {} } namespace Right { export function read() {} }', 'src/names.ts');
  const left = unit(result, 'read', 'function:Left.read');
  const right = unit(result, 'read', 'function:Right.read');
  assert.notEqual(left.identity, right.identity);
  assert.equal(left.bodyHash, right.bodyHash, 'same body is not the namespace ownership discriminator');
});

test('same-named classes and methods retain their namespace owners', () => {
  const result = observed('namespace Left { export class Store { read() {} } } namespace Right { export class Store { read() {} } }', 'src/names.ts');
  const left = unit(result, 'Store', 'class:Left.Store', 'classes');
  const right = unit(result, 'Store', 'class:Right.Store', 'classes');
  assert.notEqual(left.identity, right.identity);
  assert.notEqual(unit(result, 'read', 'method:Left.Store.read').identity,
    unit(result, 'read', 'method:Right.Store.read').identity);
});

test('nested namespace qualifiers preserve the visible lexical owner chain', () => {
  const result = observed('namespace Outer { export namespace Left { export function read() {} } export namespace Right { export function read() {} } }', 'src/names.ts');
  assert.notEqual(unit(result, 'read', 'function:Outer.Left.read').identity,
    unit(result, 'read', 'function:Outer.Right.read').identity);
});

test('namespace-qualified named identity remains stable across movement and shrink', () => {
  const before = observed('namespace Left { export function read() { use(); use(); } }', 'src/before.ts');
  const after = observed('\nnamespace Left { export function read() { use(); } }', 'src/after.ts');
  const oldUnit = unit(before, 'read', 'function:Left.read');
  const newUnit = unit(after, 'read', 'function:Left.read');
  assert.equal(oldUnit.identity, newUnit.identity);
  assert.notEqual(oldUnit.bodyHash, newUnit.bodyHash);
});
