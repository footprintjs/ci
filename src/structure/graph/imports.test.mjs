import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeImports } from './imports.mjs';
import { parseSource } from '../syntax/parse.mjs';

test('type queries are excluded and nonliteral imports cannot claim complete closure', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: "import type { Shape } from './shape.js'; export type Other = import('./type.js').Other; import './eager.js'; const lazy = import('./lazy.js'); import(chosen);" });
  const result = runtimeImports(parsed);
  assert.deepEqual(result.imports.map(item => [item.specifier, item.eager]), [['./eager.js', true], ['./lazy.js', false]]);
  assert.equal(result.unverified.length, 1);
});

function observed(text) {
  return runtimeImports(parseSource({ path: 'src/a.ts', text }));
}

function site(result, specifier) {
  assert.ok(result && Array.isArray(result.imports), 'missing import observations');
  const found = result.imports.find(item => item.specifier === specifier);
  assert.ok(found, `missing import observation: ${specifier}`);
  return found;
}

test('unused and type-position-only ordinary imports remain uncertain potential dependencies', () => {
  const result = observed("import { Unused } from './unused.js'; import { Shape } from './shape.js'; const value: Shape = local;");
  for (const name of ['./unused.js', './shape.js']) {
    assert.equal(site(result, name).eager, false);
    assert.equal(site(result, name).uncertain, true);
  }
  assert.equal(result.unverified.filter(item => item.kind === 'module-elision').length, 2);
});

test('actual runtime imported values and explicit side effects remain eager', () => {
  const result = observed("import { Base } from './base.js'; import './effects.js'; class Store extends Base {}");
  assert.equal(site(result, './base.js').eager, true);
  assert.equal(site(result, './effects.js').eager, true);
  assert.deepEqual(result.unverified, []);
});

test('global top-level require is eager and a function-scoped require is potential', () => {
  const result = observed("const value = require('./eager.js'); function load() { return require('./lazy.js'); }");
  assert.equal(site(result, './eager.js').eager, true);
  assert.equal(site(result, './lazy.js').eager, false);
  assert.deepEqual(result.unverified, []);
});

test('ambiguous local require declarations do not admit a global loader', () => {
  const result = observed("var require = own; var require; require('./not-proven.js');");
  assert.deepEqual(result.imports, []);
});

test('used top-level import-equals is eager and unused import-equals stays uncertain', () => {
  const result = observed("import leaf = require('./leaf.js'); import unused = require('./unused.js'); use(leaf);");
  assert.equal(site(result, './leaf.js').eager, true);
  assert.equal(site(result, './leaf.js').uncertain, false);
  assert.equal(site(result, './unused.js').eager, false);
  assert.equal(site(result, './unused.js').uncertain, true);
  assert.equal(result.unverified.filter(item => item.kind === 'module-elision').length, 1);
});

test('explicit type imports remain excluded even when their aliases appear in type syntax', () => {
  const result = observed("import type { Shape } from './shape.js'; import { type Other } from './other.js'; type Value = Shape & Other;");
  assert.deepEqual(result.imports, []);
  assert.deepEqual(result.unverified, []);
});

test('ordinary JavaScript imports retain their eager source semantics even when unused', () => {
  const parsed = parseSource({ path: 'src/a.mjs', text: "import { unused } from './leaf.mjs';" });
  const result = runtimeImports(parsed);
  assert.equal(site(result, './leaf.mjs').eager, true);
  assert.equal(site(result, './leaf.mjs').uncertain, false);
  assert.deepEqual(result.unverified, []);
});
