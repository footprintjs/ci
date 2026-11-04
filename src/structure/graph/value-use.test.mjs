import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { hasRuntimeValueUse, topLevelLoad } from './value-use.mjs';

function importedBinding(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const statement = parsed.sourceFile.statements[0];
  assert.ok(statement, 'missing import fixture');
  const declaration = ts.isImportEqualsDeclaration(statement) ? statement : statement.importClause?.namedBindings?.elements?.[0];
  assert.ok(declaration, 'missing imported lexical declaration');
  return declaration;
}

function loader(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  let found = null;
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') found = node;
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  assert.ok(found, 'missing loader timing fixture');
  return found;
}

const imported = "import { Base } from './base.js';";

test('runtime references follow the exact import binding even inside a deferred function body', () => {
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} function work() { return Base; }`)), true);
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} function work(Base) { return Base; }`)), false);
});

test('annotations interface extends implements and type queries are erased positions', () => {
  const source = `${imported} interface Port extends Base {} class Store implements Base {}
    type Read = typeof Base; const value: Base = local;`;
  assert.equal(hasRuntimeValueUse(importedBinding(source)), false);
});

test('own class extends is runtime while ambient class heritage is not', () => {
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} class Store extends Base {}`)), true);
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} declare class Store extends Base {}`)), false);
});

test('value assertions do not erase their expression and satisfies types do not create value use', () => {
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} const value = Base as unknown;`)), true);
  assert.equal(hasRuntimeValueUse(importedBinding(`${imported} const value = local satisfies Base;`)), false);
});

test('import-equals value use differs from its type-qualified use', () => {
  const prefix = "import leaf = require('./leaf.js');";
  assert.equal(hasRuntimeValueUse(importedBinding(`${prefix} use(leaf.value);`)), true);
  assert.equal(hasRuntimeValueUse(importedBinding(`${prefix} type Value = leaf.Shape;`)), false);
});

test('top-level synchronous loaders are eager while functions and conditional arms are potential', () => {
  assert.equal(topLevelLoad(loader("const value = require('./leaf.js');")), true);
  assert.equal(topLevelLoad(loader("function work() { return require('./leaf.js'); }")), false);
  assert.equal(topLevelLoad(loader("if (ready) require('./leaf.js');")), false);
  assert.equal(topLevelLoad(loader("ready && require('./leaf.js');")), false);
});

test('unconditional control headers and computed class names preserve eager execution', () => {
  assert.equal(topLevelLoad(loader("if (require('./leaf.js')) use();")), true);
  assert.equal(topLevelLoad(loader("class Store { [require('./leaf.js')]() {} }")), true);
  assert.equal(topLevelLoad(loader("class Store { static field = require('./leaf.js'); }")), true);
  assert.equal(topLevelLoad(loader("class Store { field = require('./leaf.js'); }")), false);
});
