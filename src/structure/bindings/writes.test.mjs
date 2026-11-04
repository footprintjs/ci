import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { hasExplicitWrite } from './writes.mjs';

test('an explicit property assignment invalidates a const receiver but a same-named local does not', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const graph = {}; graph.addFunction = other; const stable = {}; function local(stable) { stable.x = 1; }' });
  const graph = parsed.sourceFile.statements[0].declarationList.declarations[0];
  const stable = parsed.sourceFile.statements[2].declarationList.declarations[0];
  assert.equal(hasExplicitWrite(graph), true);
  assert.equal(hasExplicitWrite(stable), false);
});

test('a property write through an immutable alias also invalidates the original receiver', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'const graph = {}; const alias = graph; alias.addFunction = other;' });
  const graph = parsed.sourceFile.statements[0].declarationList.declarations[0];
  assert.equal(hasExplicitWrite(graph), true);
});
