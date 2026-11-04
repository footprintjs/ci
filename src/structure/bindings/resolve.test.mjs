import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { resolveBinding, hasLexicalBinding } from './resolve.mjs';

test('function overload declarations resolve to the single runtime implementation', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'function work(value: string): void; function work(value: string) {} work("x");' });
  const result = resolveBinding(parsed.sourceFile.statements[2].expression.expression);
  assert.ok(result?.declaration?.body);
  assert.equal(result.declaration, parsed.sourceFile.statements[1]);
});

test('a declared namespace is a lexical binding rather than the ambient global constructor', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'namespace URL { export const value = 1; } new URL("./src/data.ts", import.meta.url);' });
  const reference = parsed.sourceFile.statements[1]?.expression?.expression;
  assert.ok(reference);
  assert.equal(hasLexicalBinding(reference), true);
});

test('a class static block var does not shadow an outer binding', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const value = 1; class Store { static { var value = 2; } } value;' });
  const result = resolveBinding(parsed.sourceFile.statements[2].expression);
  assert.ok(result?.declaration);
  assert.equal(result.declaration, parsed.sourceFile.statements[0].declarationList.declarations[0]);
});

test('ambiguous local require declarations are not mistaken for an absent global binding', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'var require = own; var require; require("./leaf.js"); URL;' });
  const local = parsed.sourceFile.statements[2]?.expression?.expression;
  const global = parsed.sourceFile.statements[3]?.expression;
  assert.ok(local && global, 'missing local/global binding fixtures');
  assert.equal(resolveBinding(local), null);
  assert.equal(hasLexicalBinding(local), true);
  assert.equal(resolveBinding(global), null);
  assert.equal(hasLexicalBinding(global), false);
});

test('an external import-equals alias resolves to its own lexical declaration', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: "import leaf = require('./leaf.js'); use(leaf);" });
  const reference = parsed.sourceFile.statements[1]?.expression?.arguments[0];
  assert.ok(reference, 'missing import-equals use');
  assert.equal(resolveBinding(reference)?.declaration, parsed.sourceFile.statements[0]);
});
