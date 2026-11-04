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
