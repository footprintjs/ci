import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './index.mjs';
import { LITERAL_TEST_CONFIG } from './config.fixture.mjs';

const snapshot = files => ({ files: Object.entries({ 'vitest.config.ts': LITERAL_TEST_CONFIG, ...files }).map(([path, text]) => ({ path, text })) });
const resultOf = (base, head) => {
  const result = affectedTests(snapshot(head), snapshot(base));
  assert.ok(result && typeof result === 'object', 'missing selection report');
  assert.ok(Array.isArray(result.tests), 'missing selected tests');
  assert.ok(Array.isArray(result.alwaysRun), 'missing always-run set');
  assert.ok(Array.isArray(result.reasons), 'missing selection reasons');
  assert.equal(result.estimate, true, 'selection must be labelled an estimate');
  assert.equal(typeof result.compilerOnly, 'boolean');
  return result;
};
const sources = {
  'src/index.ts': "export { first } from './first.js'; export { second } from './second.js';",
  'src/first.ts': 'export function first() { return 1; }',
  'src/second.ts': 'export function second() { return 2; }',
  'src/first.test.ts': "import { first } from './first.js'; void first();",
  'test/door-first.test.ts': "import { first } from '../src/index.js'; void first();",
  'test/door-second.test.ts': "import { second } from '../src/index.js'; void second();",
};
const changedFirst = { ...sources, 'src/first.ts': 'export function first() { return 3; }' };

test('a runtime change selects its own colocated test', () => {
  assert.ok(resultOf(sources, changedFirst).tests.includes('src/first.test.ts'));
});

test('a named door import follows its owner without unrelated exports', () => {
  const result = resultOf(sources, changedFirst);
  assert.ok(result.tests.includes('test/door-first.test.ts'));
  assert.ok(!result.tests.includes('test/door-second.test.ts'));
});

test('renamed reexports retain the original binding owner', () => {
  const extra = {
    'src/alias.ts': "export { first as chosen } from './first.js';",
    'test/alias.test.ts': "import { chosen as call } from '../src/alias.js'; void call();",
  };
  assert.ok(resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra }).tests.includes('test/alias.test.ts'));
});

test('transitive runtime dependencies of a named owner remain affected', () => {
  const base = { ...sources, 'src/first.ts': "import { value } from './leaf.js'; export function first() { return value; }",
    'src/leaf.ts': 'export const value = 1;' };
  const result = resultOf(base, { ...base, 'src/leaf.ts': 'export const value = 3;' });
  assert.ok(result.tests.includes('src/first.test.ts'));
  assert.ok(result.tests.includes('test/door-first.test.ts'));
});

test('namespace import consumers conservatively follow every possible member', () => {
  const extra = { 'test/namespace.test.ts': "import * as api from '../src/index.js'; use(api);" };
  assert.ok(resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra }).tests.includes('test/namespace.test.ts'));
});

test('a side-effect import keeps eager module effects in its dependency map', () => {
  const extra = { 'test/effect.test.ts': "import '../src/first.js';" };
  assert.ok(resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra }).tests.includes('test/effect.test.ts'));
});

test('deleted source files are compared using the old dependency graph too', () => {
  const head = { ...sources };
  delete head['src/first.ts'];
  const result = resultOf(sources, head);
  assert.ok(result.tests.includes('src/first.test.ts'));
  assert.ok(result.tests.includes('test/door-first.test.ts'));
});

test('a changed test is selected even when its source dependencies are unchanged', () => {
  const head = { ...sources, 'src/first.test.ts': sources['src/first.test.ts'] + '\nassert(true);' };
  assert.ok(resultOf(sources, head).tests.includes('src/first.test.ts'));
});

test('known source-file readers are always run on unrelated runtime changes', () => {
  const extra = { 'test/source-reader.test.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/second.ts', 'utf8');" };
  const result = resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra });
  assert.ok(result.tests.includes('test/source-reader.test.ts'));
  assert.ok(result.alwaysRun.includes('test/source-reader.test.ts'));
});

test('known directory scanners are always run', () => {
  const extra = { 'test/folders.test.ts': "import { readdirSync } from 'node:fs'; readdirSync('src');" };
  assert.ok(resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra }).alwaysRun.includes('test/folders.test.ts'));
});

test('package changes select every existing test', () => {
  const base = { ...sources, 'package.json': '{"name":"example","version":"1.0.0"}' };
  const head = { ...base, 'package.json': '{"name":"example","version":"2.0.0"}' };
  assert.deepEqual([...resultOf(base, head).tests].sort(), Object.keys(sources).filter(path => /\.test\.ts$/.test(path)).sort());
});

test('configuration changes select every existing test', () => {
  const head = { ...sources, 'vitest.config.ts': 'export default {};' };
  const result = resultOf(sources, head);
  assert.ok(result.tests.includes('test/door-first.test.ts'));
  assert.ok(result.tests.includes('test/door-second.test.ts'));
});

test('test helper and setup changes select the whole suite', () => {
  for (const path of ['test/helpers/fixture.ts', 'test/setup.ts']) {
    const result = resultOf(sources, { ...sources, [path]: 'export const value = 1;' });
    assert.ok(result.tests.includes('test/door-first.test.ts'));
    assert.ok(result.tests.includes('test/door-second.test.ts'));
  }
});

test('a types-only source change selects the compiler without runtime tests', () => {
  const base = { ...sources, 'src/types.ts': 'export interface Shape { value: string }' };
  const result = resultOf(base, { ...base, 'src/types.ts': 'export interface Shape { value: number }' });
  assert.equal(result.compilerOnly, true);
  assert.deepEqual(result.tests, []);
});

test('mixed runtime and types-only changes retain affected runtime tests', () => {
  const base = { ...sources, 'src/types.ts': 'export interface Shape {}' };
  const result = resultOf(base, { ...changedFirst, 'src/types.ts': 'export interface Shape { value: number }' });
  assert.equal(result.compilerOnly, false);
  assert.ok(result.tests.includes('src/first.test.ts'));
});

test('unresolved dynamic import coverage cannot be reported as exact selection', () => {
  const extra = { 'test/dynamic.test.ts': 'const path = choosePath(); await import(path);' };
  const result = resultOf({ ...sources, ...extra }, { ...changedFirst, ...extra });
  assert.ok(result.coverage && typeof result.coverage === 'object');
  assert.equal(result.coverage.complete, false);
  assert.ok(Array.isArray(result.coverage.unverified));
  assert.ok(result.coverage.unverified.some(item => item.path === 'test/dynamic.test.ts'));
  assert.ok(result.tests.includes('test/dynamic.test.ts'));
});
