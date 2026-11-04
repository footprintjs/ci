import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { sourceTokens, tokenLines, tokenHash } from './tokens.mjs';

test('literal comment markers are code and real JSDoc is trivia', () => {
  const text = '/** docs\n * more docs */\nconst pattern = /[/][/]/;\nconst value = `a\n// inside\nb`;';
  const source = ts.createSourceFile('sample.ts', text, ts.ScriptTarget.Latest, true);
  const tokens = sourceTokens(source);
  assert.deepEqual([...tokenLines(source, tokens)], [3, 4, 5, 6]);
  assert.ok(!tokens.some(token => token.text.includes('more docs')));
});

test('canonical hashes preserve token boundaries and ignore trivia', () => {
  const tokens = text => sourceTokens(ts.createSourceFile('sample.ts', text, ts.ScriptTarget.Latest, true));
  assert.equal(tokenHash(tokens('use(1);')), tokenHash(tokens('/* docs */ use ( 1 );')));
  assert.notEqual(tokenHash(tokens('use(1);')), tokenHash(tokens('use(2);')));
});
