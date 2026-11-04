import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './index.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
function select(base, head) {
  const result = affectedTests(snapshot(head), snapshot(base));
  assert.ok(result && Array.isArray(result.tests), 'missing selected-test report');
  assert.ok(Array.isArray(result.changedPaths), 'missing changed paths');
  assert.ok(result.coverage && Array.isArray(result.coverage.unverified), 'missing coverage');
  assert.equal(typeof result.compilerRequired, 'boolean');
  assert.equal(result.fullSuiteBeforeMerge, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  return result;
}

test('new tests select themselves without a source change', () => {
  assert.deepEqual(select({}, { 'test/new.test.ts': 'assert(true);' }).tests, ['test/new.test.ts']);
});

test('deleted tests remain changed evidence but are never returned as runnable head tests', () => {
  const result = select({ 'test/old.test.ts': 'assert(true);' }, {});
  assert.deepEqual(result.tests, []);
  assert.ok(result.changedPaths.includes('test/old.test.ts'));
});

test('ambient const-enum values do not qualify for compiler-only selection', () => {
  const base = { 'src/value.d.ts': 'export declare const enum Value { first = 1 }',
    'test/value.test.ts': "import { Value } from '../src/value.js'; assert(Value.first);" };
  const result = select(base, { ...base, 'src/value.d.ts': 'export declare const enum Value { first = 2 }' });
  assert.equal(result.compilerOnly, false);
  assert.equal(result.compilerRequired, true);
  assert.ok(result.tests.includes('test/value.test.ts'));
});

test('side-effect registration survives named barrel narrowing', () => {
  const base = { 'src/index.ts': "import './register.js'; export { work } from './work.js';",
    'src/register.ts': 'register(1);', 'src/work.ts': 'export function work() {}',
    'test/work.test.ts': "import { work } from '../src/index.js'; work();" };
  assert.ok(select(base, { ...base, 'src/register.ts': 'register(2);' }).tests.includes('test/work.test.ts'));
});

test('effects in an unrequested reexported module remain dependencies', () => {
  const base = { 'src/index.ts': "export { work } from './work.js'; export { extra } from './extra.js';",
    'src/work.ts': 'export function work() {}', 'src/extra.ts': 'register(1); export function extra() {}',
    'test/work.test.ts': "import { work } from '../src/index.js'; work();" };
  assert.ok(select(base, { ...base, 'src/extra.ts': 'register(2); export function extra() {}' }).tests.includes('test/work.test.ts'));
});

test('tracked JSON assets propagate through runtime source dependencies', () => {
  const base = { 'src/owner.ts': "import data from './data.json'; export const value = data.value;",
    'src/data.json': '{"value":1}', 'test/data.test.ts': "import { value } from '../src/owner.js'; assert(value);" };
  assert.ok(select(base, { ...base, 'src/data.json': '{"value":2}' }).tests.includes('test/data.test.ts'));
});

test('unresolved imports in a reachable helper select its test on unrelated runtime changes', () => {
  const base = { 'src/owner.ts': 'export function work() { return import(choose()); }',
    'src/other.ts': 'export const value = 1;', 'test/owner.test.ts': "import { work } from '../src/owner.js'; work();" };
  const result = select(base, { ...base, 'src/other.ts': 'export const value = 2;' });
  assert.ok(result.tests.includes('test/owner.test.ts'));
  assert.equal(result.coverage.complete, false);
});

test('erased interfaces still require compiler validation', () => {
  const base = { 'src/types.ts': 'export interface Shape { value: string }' };
  const result = select(base, { 'src/types.ts': 'export interface Shape { value: number }' });
  assert.equal(result.compilerOnly, true);
  assert.equal(result.compilerRequired, true);
  assert.deepEqual(result.tests, []);
});

test('types-only edits retain always-run source readers', () => {
  const base = { 'src/types.ts': 'export interface Shape { value: string }',
    'test/source.test.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/types.ts');" };
  const result = select(base, { ...base, 'src/types.ts': 'export interface Shape { value: number }' });
  assert.deepEqual(result.tests, ['test/source.test.ts']);
  assert.deepEqual(result.alwaysRun, ['test/source.test.ts']);
  assert.equal(result.compilerRequired, true);
  assert.equal(result.compilerOnly, false);
});

test('a registration call retains the imported implementation even when consumers import other names', () => {
  const base = { 'src/index.ts': "import './register.js'; export { first } from './first.js'; export { second } from './second.js';",
    'src/register.ts': "import { setup } from './effect.js'; setup();", 'src/effect.ts': 'export function setup() { return 1; }',
    'src/first.ts': 'export function first() {}', 'src/second.ts': 'export function second() {}',
    'test/first.test.ts': "import { first } from '../src/index.js'; first();",
    'test/second.test.ts': "import { second } from '../src/index.js'; second();" };
  const result = select(base, { ...base, 'src/effect.ts': 'export function setup() { return 2; }' });
  assert.deepEqual(result.tests, ['test/first.test.ts', 'test/second.test.ts']);
});

test('star reexports follow the unique actual owner rather than every inert sibling', () => {
  const base = { 'src/index.ts': "export * from './first.js'; export * from './second.js';",
    'src/first.ts': 'export function first() { return 1; }', 'src/second.ts': 'export function second() { return 2; }',
    'test/first.test.ts': "import { first } from '../src/index.js'; first();",
    'test/second.test.ts': "import { second } from '../src/index.js'; second();" };
  const result = select(base, { ...base, 'src/first.ts': 'export function first() { return 3; }' });
  assert.deepEqual(result.tests, ['test/first.test.ts']);
});

test('path-only asset OID changes propagate through actual adapter metadata', () => {
  const files = oid => [{ path: 'src/data.json', text: '', content: 'path-only', oid, mode: '100644' },
    { path: 'src/read.ts', text: "import data from './data.json'; export const value = data.value;" },
    { path: 'test/data.test.ts', text: "import { value } from '../src/read.js'; assert(value);" }];
  const result = affectedTests({ files: files('b'.repeat(40)) }, { files: files('a'.repeat(40)) });
  assert.ok(result.changedPaths.includes('src/data.json'));
  assert.deepEqual(result.tests, ['test/data.test.ts']);
});

test('an executable-mode change selects the whole known suite conservatively', () => {
  const files = mode => [{ path: 'scripts/prepare.sh', text: '', content: 'path-only', mode, oid: 'a'.repeat(40) },
    { path: 'test/one.test.ts', text: 'assert(true);' }, { path: 'test/two.test.ts', text: 'assert(true);' }];
  const result = affectedTests({ files: files('100755') }, { files: files('100644') });
  assert.deepEqual(result.tests, ['test/one.test.ts', 'test/two.test.ts']);
  assert.ok(result.reasons.some(item => item.kind === 'whole-suite'));
});

test('aliased require, createRequire and eval loading keep dependent tests conservative', () => {
  for (const loader of ['const load = require; load(path);',
    "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); load(path);",
    'eval(source);']) {
    const base = { 'src/loader.ts': loader, 'src/unrelated.ts': 'export const value = 1;',
      'test/loader.test.ts': "import '../src/loader.js';" };
    const result = select(base, { ...base, 'src/unrelated.ts': 'export const value = 2;' });
    assert.ok(result.tests.includes('test/loader.test.ts'), loader);
    assert.equal(result.coverage.complete, false);
    assert.ok(result.coverage.unverified.some(item => item.path === 'src/loader.ts'));
  }
});

test('two different bindings from one source file remain ambiguous star owners', () => {
  const base = { 'src/leaf.ts': 'export function first() {} export function second() {}',
    'src/a.ts': "export { first as chosen } from './leaf.js';", 'src/b.ts': "export { second as chosen } from './leaf.js';",
    'src/index.ts': "export * from './a.js'; export * from './b.js';", 'src/other.ts': 'export const value = 1;',
    'test/chosen.test.ts': "import { chosen } from '../src/index.js'; chosen();" };
  const result = select(base, { ...base, 'src/other.ts': 'export const value = 2;' });
  assert.equal(result.coverage.complete, false);
  assert.ok(result.tests.includes('test/chosen.test.ts'));
});
