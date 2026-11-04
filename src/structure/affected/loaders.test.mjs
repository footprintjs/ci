import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { loadingRequests } from './loaders.mjs';

const loading = text => loadingRequests(parseSource({ path: 'src/a.ts', text }),
  { files: new Map([['src/leaf.ts', { text: '' }]]), packages: new Set() });

test('literal direct loaders retain their actual tracked source target', () => {
  const result = loading('require("./leaf.js"); import("./leaf.js");');
  assert.deepEqual(result.requests.map(item => item.target), ['src/leaf.ts', 'src/leaf.ts']);
  assert.deepEqual(result.unverified, []);
});

test('loader aliases and reflection are uncertain while a shadowed require is unrelated', () => {
  assert.ok(loading('const load = require; load(path);').unverified.length);
  assert.ok(loading('eval(text);').unverified.length);
  assert.ok(loading('module.require(path);').unverified.length);
  assert.ok(loading('globalThis[chosen](path);').unverified.length);
  assert.deepEqual(loading('function require(value) {} require(path);'), { requests: [], unverified: [] });
});
