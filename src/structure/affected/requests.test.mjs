import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { importNames, makeRequest } from './requests.mjs';

test('runtime import aliases preserve actual imported names and exclude explicit type entries', () => {
  const source = parseSource({ path: 'test/a.test.ts', text: 'import value, { first as chosen, type Shape } from "../src/a.js";' });
  assert.deepEqual(importNames(source.sourceFile.statements[0]), [{ local: 'value', name: 'default' }, { local: 'chosen', name: 'first' }]);
});

test('a tracked data target is a dependency while unknown project aliases are not guessed external', () => {
  const source = parseSource({ path: 'src/a.ts', text: 'import data from "./data.json";' });
  const context = { files: new Map([['src/data.json', { text: '' }]]), packages: new Set() };
  const request = details => makeRequest(source, source.sourceFile.statements[0], details, context);
  assert.equal(request({ specifier: './data.json', names: ['default'] }).target, 'src/data.json');
  assert.ok(request({ specifier: '@/hidden', names: ['work'] }).reason);
});
