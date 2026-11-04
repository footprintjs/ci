import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './index.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
const config = "import { defineConfig as config } from 'vitest/config'; export default config({ test: { include: ['test/**/*.test.ts', 'src/**/*.test.ts'] } });";
const files = () => ({ 'vitest.config.ts': config, 'src/leaf.ts': 'export const value = 1;',
  'src/other.ts': 'export const value = 2;', 'test/adapters/conformance/rigs.ts': "export { value } from '../../../src/leaf.js';",
  'test/unusedUtility.ts': 'export const utility = 1;',
  'test/leaf.test.ts': "import { value } from './adapters/conformance/rigs.js'; assert(value);",
  'test/other.test.ts': "import { value } from '../src/other.js'; assert(value);" });

test('literal runner includes exclude beside-test helpers without losing their dependency edges', () => {
  const base = files();
  const result = affectedTests(snapshot({ ...base, 'src/leaf.ts': 'export const value = 3;' }), snapshot(base));
  assert.deepEqual(result.tests, ['test/leaf.test.ts']);
  assert.ok(result.selection && result.discovery, 'missing selection/discovery metadata');
  assert.equal(result.selection.known, 2);
  assert.equal(result.discovery.mode, 'literal-include');
  assert.ok(result.discovery.notes.some(item => item.path === 'test/unusedUtility.ts'));
  assert.equal(result.reasons.some(item => item.kind === 'whole-suite'), false);
});

for (const replacement of [null, "export default { test: { include: chosen } };",
  "export default { test: { include: ['test/**/*.test.ts'], ...override } };",
  "export default { test: { include: ['test/**/*.test.ts'], projects: ['packages/*'] } };",
  "export default { root:'a', root:'b', test:{include:['test/**/*.test.ts']} };",
  "export default { get root(){return 'a'}, test:{include:['test/**/*.test.ts']} };",
  "export default { test:{include:['test/**/*.test.ts'],dir:'a',dir:'b'} };",
  "export default { test:{include:['test/**/*.test.ts'],get dir(){return 'a'}} };",
  "export default { test:{include:['test/**/*.test.ts'],projects:['a'],projects:['b']} };",
  "export default { test:{include:['test/**/*.test.ts'],get workspace(){return ['a']}} };",
  "export default { test:{include:['test/**/*.test.ts'],includeSource:['a'],includeSource:['b']} };"]) {
  test(`unproved runner discovery remains whole-suite: ${replacement}`, () => {
    const base = files();
    if (replacement === null) delete base['vitest.config.ts']; else base['vitest.config.ts'] = replacement;
    const result = affectedTests(snapshot({ ...base, 'src/leaf.ts': 'export const value = 3;' }), snapshot(base));
    assert.deepEqual(result.tests, ['test/leaf.test.ts', 'test/other.test.ts']);
    assert.ok(result.coverage.unverified.some(item => item.kind === 'affected-test-discovery'));
  });
}

test('a proven custom literal test include determines known tests beyond suffix conventions', () => {
  const base = { 'vitest.config.ts': "export default { test: { include: ['checks/**/*.case.ts'] } };",
    'src/leaf.ts': 'export const value = 1;', 'checks/leaf.case.ts': "import { value } from '../src/leaf.js'; assert(value);" };
  const result = affectedTests(snapshot({ ...base, 'src/leaf.ts': 'export const value = 2;' }), snapshot(base));
  assert.deepEqual(result.tests, ['checks/leaf.case.ts']);
  assert.ok(result.selection, 'missing selection metadata');
  assert.equal(result.selection.known, 1);
});
