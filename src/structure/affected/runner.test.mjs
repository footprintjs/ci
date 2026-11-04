import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { runnerInclude } from './runner.mjs';

const observe = text => runnerInclude(new Map([['vitest.config.ts', parseSource({ path: 'vitest.config.ts', text })]]));

test('an imported defineConfig alias preserves literal include ownership without executing the config', () => {
  const result = observe("import { defineConfig as conf } from 'vitest/config'; export default conf({ test: { include: ['test/**/*.test.ts'] }, resolve: { alias: getAliases() } });");
  assert.deepEqual(result.include, ['test/**/*.test.ts']);
});

test('same-spelled local config functions and spread overrides cannot prove includes', () => {
  assert.ok(observe("function defineConfig(x) { return x; } export default defineConfig({test:{include:['test/*.ts']}});").reason);
  assert.ok(observe("export default {...override, test:{include:['test/*.ts']}};").reason);
});

test('alternate roots and additional includeSource discovery remain unproved', () => {
  assert.ok(observe("export default {root:'packages/a',test:{include:['test/*.ts']}};").reason);
  assert.ok(observe("export default {test:{dir:'packages/a',include:['test/*.ts']}};").reason);
  assert.ok(observe("export default {test:{include:['test/*.ts'],includeSource:['src/*.ts']}};").reason);
});
