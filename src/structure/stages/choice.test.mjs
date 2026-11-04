import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { ownChoice } from './choice.mjs';

function choice(text, required = 'either') {
  const parsed = parseSource({ path: 'src/a.ts', text });
  const callable = parsed.sourceFile.statements.find(node => ts.isFunctionDeclaration(node));
  assert.ok(callable?.body, 'missing choice callable');
  return ownChoice(callable, required);
}

test('own imported namespace choice counts while a nested body or shadow does not', () => {
  const imported = "import * as fp from 'footprintjs';";
  assert.equal(choice(`${imported} function work(scope) { return fp.select(scope, []); }`, 'select').found, true);
  assert.equal(choice(`${imported} function work(scope) { function child() { fp.decide(scope, []); } }`).found, false);
  assert.equal(choice("import { decide } from 'footprintjs'; function work(decide) { return decide(); }").found, false);
});
