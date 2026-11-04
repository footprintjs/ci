import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { changedPaths, executableChange, erasedSource, wholeSuiteInput } from './changes.mjs';

test('asset metadata participates in a diff even when both placeholder texts are empty', () => {
  const before = new Map([['asset.bin', { text: '', oid: 'old', mode: '100644' }]]);
  const after = new Map([['asset.bin', { text: '', oid: 'new', mode: '100755' }]]);
  assert.deepEqual(changedPaths(after, before), ['asset.bin']);
  assert.equal(executableChange('asset.bin', after, before), true);
  assert.deepEqual(changedPaths(before, before), []);
});

test('only finite erased syntax proves compiler-only potential', () => {
  const parsed = text => parseSource({ path: 'src/types.ts', text });
  assert.equal(erasedSource(parsed('import type { Shape } from "./shape.js"; export interface Port {}')), true);
  for (const text of ['declare const enum Value { a = 1 }', 'enum Value { a = 1 }', 'declare const value: number;', 'import "./register.js";']) {
    assert.equal(erasedSource(parsed(text)), false, text);
  }
});

test('configuration package and helper inputs have whole-suite scope', () => {
  for (const path of ['package-lock.json', 'vitest.config.ts', 'test/helpers/factory.ts', 'src/chart.fixture.mjs']) {
    assert.equal(wholeSuiteInput(path), true, path);
  }
  assert.equal(wholeSuiteInput('src/owner.ts'), false);
});
