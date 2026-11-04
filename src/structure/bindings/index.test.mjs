import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { resolveBinding } from './index.mjs';

const imports = "import { flowChart as chart } from 'footprintjs';";

/** Proposed colocated test helper; no parser invocation has run in this draft. */
function reference(text, name = 'chart') {
  const marker = '/*USE*/';
  const marked = text.indexOf(marker);
  assert.ok(marked >= 0, 'missing fixture reference marker');
  const offset = text.indexOf(name, marked + marker.length);
  assert.ok(offset >= 0, 'missing marked identifier text');
  const { sourceFile } = parseSource({ path: 'src/example.ts', text });
  let found = null;
  const visit = node => {
    if (ts.isIdentifier(node) && node.getStart(sourceFile) === offset) found = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(found, `missing marked identifier AST: ${name}`);
  return found;
}

function declaration(identifier) {
  const result = resolveBinding(identifier);
  assert.ok(result && typeof result === 'object', 'missing lexical binding record');
  assert.ok(result.declaration, 'missing lexical declaration node');
  return result.declaration;
}

function importOwner(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isImportDeclaration(current)) return current;
  }
  assert.fail('binding is not owned by an import declaration');
}

test('an imported alias retains its actual import declaration and module spelling', () => {
  const found = declaration(reference(`${imports}\n/*USE*/chart('Root', () => {}, 'root');`));
  assert.ok(ts.isImportSpecifier(found));
  assert.equal(found.name.text, 'chart');
  assert.equal(found.propertyName?.text, 'flowChart');
  assert.equal(importOwner(found).moduleSpecifier.text, 'footprintjs');
});

test('a namespace reference resolves to its namespace import rather than a property name', () => {
  const found = declaration(reference("import * as fp from 'footprintjs'; /*USE*/fp.flowChart();", 'fp'));
  assert.ok(ts.isNamespaceImport(found));
  assert.equal(found.name.text, 'fp');
  assert.equal(importOwner(found).moduleSpecifier.text, 'footprintjs');
});

test('a const alias chain exposes each lexical step without pretending the value was resolved', () => {
  const text = `${imports}\nconst first = chart; const second = first; /*USE*/second();`;
  const second = declaration(reference(text, 'second'));
  assert.ok(ts.isVariableDeclaration(second) && ts.isIdentifier(second.initializer));
  const first = declaration(second.initializer);
  assert.ok(ts.isVariableDeclaration(first) && ts.isIdentifier(first.initializer));
  const imported = declaration(first.initializer);
  assert.ok(ts.isImportSpecifier(imported));
  assert.equal(imported.propertyName?.text, 'flowChart');
});

test('a function parameter shadows the real imported alias', () => {
  const found = declaration(reference(`${imports}\nfunction work(chart) { /*USE*/chart(); }`));
  assert.ok(ts.isParameter(found));
  assert.equal(found.name.text, 'chart');
});

test('a later same-block const shadows the import even before its declaration', () => {
  const found = declaration(reference(`${imports}\nfunction work() { /*USE*/chart(); const chart = other; }`));
  assert.ok(ts.isVariableDeclaration(found));
  assert.equal(found.name.text, 'chart');
  assert.ok(found.getStart() > found.getSourceFile().text.indexOf('/*USE*/'));
});

test('a nested block const does not escape its block to shadow an outer import', () => {
  const found = declaration(reference(`${imports}\nfunction work() { { const chart = other; } /*USE*/chart(); }`));
  assert.ok(ts.isImportSpecifier(found));
});

test('a block var binds throughout its function including an earlier reference', () => {
  const text = `${imports}\nfunction work() { /*USE*/chart(); if (ready) { var chart = other; } }`;
  const found = declaration(reference(text));
  assert.ok(ts.isVariableDeclaration(found));
  assert.equal(found.name.text, 'chart');
  assert.equal(found.parent.flags & ts.NodeFlags.BlockScoped, 0);
});

test('a catch binding shadows the import only within its catch', () => {
  const found = declaration(reference(`${imports}\ntry { work(); } catch (chart) { /*USE*/chart(); }`));
  assert.ok(ts.isVariableDeclaration(found));
  assert.ok(ts.isCatchClause(found.parent));
});

test('an object-destructured arrow parameter resolves the local binding name', () => {
  const text = `${imports}\nconst work = ({ chart: local }) => { /*USE*/local(); };`;
  const found = declaration(reference(text, 'local'));
  assert.ok(ts.isBindingElement(found));
  assert.equal(found.name.text, 'local');
  assert.equal(found.propertyName?.text, 'chart');
});

test('nested arrow destructuring and array rest preserve their individual bindings', () => {
  const nested = declaration(reference('const work = ({ nested: { pick } }) => { /*USE*/pick(); };', 'pick'));
  assert.ok(ts.isBindingElement(nested));
  assert.equal(nested.name.text, 'pick');
  const rest = declaration(reference('const work = ([first, ...rest]) => { return /*USE*/rest; };', 'rest'));
  assert.ok(ts.isBindingElement(rest));
  assert.ok(rest.dotDotDotToken);
});

test('a local same-named function is a local declaration rather than import evidence', () => {
  const text = `${imports}\nfunction work() { /*USE*/chart(); function chart() {} }`;
  const found = declaration(reference(text));
  assert.ok(ts.isFunctionDeclaration(found));
  assert.equal(found.name.text, 'chart');
});

test('a local namespace-shaped object does not establish an imported namespace value', () => {
  const text = "import * as fp from 'footprintjs'; function work() { const fp = { flowChart() {} }; /*USE*/fp.flowChart(); }";
  const found = declaration(reference(text, 'fp'));
  assert.ok(ts.isVariableDeclaration(found));
  assert.ok(ts.isObjectLiteralExpression(found.initializer));
});

test('a property-access name is not a lexical reference to a same-named variable', () => {
  const identifier = reference('const chart = 1; const holder = { chart: 2 }; holder./*USE*/chart;');
  assert.equal(resolveBinding(identifier), null);
});

test('computed property expressions and shorthand properties remain lexical references', () => {
  const computed = declaration(reference(`${imports}\nconst holder = {}; holder[/*USE*/chart];`));
  assert.ok(ts.isImportSpecifier(computed));
  const shorthand = declaration(reference(`${imports}\nconst holder = { /*USE*/chart };`));
  assert.ok(ts.isImportSpecifier(shorthand));
});

test('cyclic aliases have lexical declarations without supplying immutable-value proof', () => {
  const start = declaration(reference('const first = second; const second = first; /*USE*/first();', 'first'));
  assert.ok(ts.isVariableDeclaration(start) && ts.isIdentifier(start.initializer));
  const next = declaration(start.initializer);
  assert.ok(ts.isVariableDeclaration(next) && ts.isIdentifier(next.initializer));
  assert.equal(declaration(next.initializer), start);
});

test('a reassigned let resolves lexically but its initializer is not its proven current value', () => {
  const text = `${imports}\nlet alias = chart; alias = unrelated; /*USE*/alias();`;
  const found = declaration(reference(text, 'alias'));
  assert.ok(ts.isVariableDeclaration(found));
  assert.ok(found.parent.flags & ts.NodeFlags.Let);
  assert.ok(ts.isIdentifier(found.initializer));
  assert.equal(found.initializer.text, 'chart');
});

test('an unbound identifier returns null instead of an invented declaration', () => {
  assert.equal(resolveBinding(reference('/*USE*/missing();', 'missing')), null);
});
