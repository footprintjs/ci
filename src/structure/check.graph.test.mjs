import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';
import { finding, noFindings, reportOf, snapshot } from './check.fixture.mjs';

const GRAPH_RULES = ['mutual-siblings', 'sealed-folder', 'direct-imports'];
const observe = files => reportOf(checkStructure(snapshot(files)));

function anyFinding(report, rule) {
  const found = report.findings.find(item => item.rule === rule);
  assert.ok(found, `missing ${rule} finding`);
  assert.equal(typeof found.path, 'string');
  return found;
}

function loadOf(report, path) {
  assert.ok(Array.isArray(report.loads), 'missing report.loads');
  const found = report.loads.find(item => item.path === path);
  assert.ok(found, `missing load observation for ${path}`);
  assert.ok(Array.isArray(found.eagerSourceFiles), 'missing eager source-file closure');
  assert.ok(Array.isArray(found.potentialSourceFiles), 'missing potential source-file closure');
  return found;
}

function dependencyFixture(count) {
  const targets = Array.from({ length: count }, (_, index) => `src/deps/dependency-${index}.ts`);
  const source = targets.map(path => `import './${path.slice(4).replace(/\.ts$/, '.js')}';`).join('\n');
  return { 'src/use.ts': source, ...Object.fromEntries(targets.map(path => [path, 'export const value = 1;'])) };
}

test('a one-way runtime import between sibling folders is legal', () => {
  const report = observe({
    'src/left/source.ts': "import { value } from '../right/target.js'; export const result = value;",
    'src/right/target.ts': 'export const value = 1;',
  });
  noFindings(report, GRAPH_RULES);
});

test('reciprocal runtime edges between sibling folders are reported', () => {
  const report = observe({
    'src/left/source.ts': "import { value } from '../right/target.js'; export const result = value;",
    'src/right/target.ts': "import { result } from '../left/source.js'; export const value = () => result;",
  });
  anyFinding(report, 'mutual-siblings');
});

test('mutual siblings are found below arbitrary shared folder depth', () => {
  const report = observe({
    'src/features/team/left/inner/source.ts': "import { right } from '../../right/deep/target.js'; export const left = () => right;",
    'src/features/team/right/deep/target.ts': "import { left } from '../../left/inner/source.js'; export const right = () => left;",
  });
  anyFinding(report, 'mutual-siblings');
});

test('a type-only reverse import creates neither a mutual edge nor a load', () => {
  const report = observe({
    'src/index.ts': "export { value } from './left/source.js';",
    'src/left/source.ts': "import { right } from '../right/target.js'; export interface Shape {} export const value = right;",
    'src/right/target.ts': "import type { Shape } from '../left/source.js'; export const right = 1;",
    'src/types/only.ts': 'export interface Only {}',
    'src/right/unused.ts': "import type { Only } from '../types/only.js'; export type { Only } from '../types/only.js';",
  });
  noFindings(report, ['mutual-siblings']);
  assert.deepEqual([...loadOf(report, 'src/index.ts').eagerSourceFiles].sort(),
    ['src/index.ts', 'src/left/source.ts', 'src/right/target.ts']);
  assert.ok(!loadOf(report, 'src/index.ts').potentialSourceFiles.includes('src/types/only.ts'));
});

test('type-only imports and type queries do not load their source targets', () => {
  const report = observe({
    'src/index.ts': "import type { Shape } from './types/shape.js'; export type { Shape } from './types/shape.js'; export type Other = import('./types/other.js').Other; export const value = 1;",
    'src/types/shape.ts': 'export interface Shape {}',
    'src/types/other.ts': 'export interface Other {}',
  });
  const load = loadOf(report, 'src/index.ts');
  assert.deepEqual(load.eagerSourceFiles, ['src/index.ts']);
  assert.deepEqual(load.potentialSourceFiles, ['src/index.ts']);
});

test('co-located and external test files do not create runtime folder edges', () => {
  const report = observe({
    'src/left/source.ts': "import { value } from '../right/target.js'; export const result = value;",
    'src/right/target.ts': 'export const value = 1;',
    'src/right/target.test.ts': "import { result } from '../left/source.js'; void result;",
    'test/reverse.test.ts': "import { result } from '../src/left/source.js'; void result;",
  });
  noFindings(report, GRAPH_RULES);
});

test('case-insensitive sibling facade seals allow the facade and internal consumers', () => {
  const report = observe({
    'src/Agent.ts': "export { run } from './agent/run.js';",
    'src/agent/run.ts': 'export function run() {}',
    'src/agent/inside.ts': "import { run } from './run.js'; export const inside = run;",
  });
  noFindings(report, ['sealed-folder']);
});

test('an external file cannot bypass a differently cased sibling facade', () => {
  const report = observe({
    'src/Agent.ts': "export { run } from './agent/run.js';",
    'src/agent/run.ts': 'export function run() {}',
    'src/other.ts': "import { run } from './agent/run.js'; export const other = run;",
  });
  finding(report, 'sealed-folder', 'src/other.ts');
});

test('the same seal applies to external consumers at a deeper folder depth', () => {
  const report = observe({
    'src/domain/Agent.ts': "export { run } from './agent/run.js';",
    'src/domain/agent/run.ts': 'export function run() {}',
    'src/domain/other/read.ts': "import { run } from '../agent/run.js'; export const read = run;",
  });
  finding(report, 'sealed-folder', 'src/domain/other/read.ts');
});

test('type-only and test consumers do not violate a runtime seal', () => {
  const report = observe({
    'src/Agent.ts': "export type { Shape } from './agent/shape.js';",
    'src/agent/shape.ts': 'export interface Shape {}',
    'src/other.ts': "import type { Shape } from './agent/shape.js'; export type Copy = Shape;",
    'test/agent.test.ts': "import { value } from '../src/agent/value.js'; void value;",
    'src/agent/value.ts': 'export const value = 1;',
  });
  noFindings(report, ['sealed-folder']);
});

test('exactly twenty unique resolved runtime modules meet the proposed direct ceiling', () => {
  noFindings(observe(dependencyFixture(20)), ['direct-imports']);
});

test('a twenty-first unique resolved runtime module is reported', () => {
  finding(observe(dependencyFixture(21)), 'direct-imports', 'src/use.ts');
});

test('duplicate imports of one resolved module count once', () => {
  const files = dependencyFixture(20);
  files['src/use.ts'] += "\nimport './deps/dependency-0.js';\nimport { value } from './deps/dependency-0.js';";
  noFindings(observe(files), ['direct-imports']);
});

test('load reports include the entry and transitive eager reexport/import closure', () => {
  const report = observe({
    'src/index.ts': "export { middle } from './middle.js';",
    'src/middle.ts': "import { leaf } from './leaf.js'; export const middle = leaf;",
    'src/leaf.ts': 'export const leaf = 1;',
  });
  const load = loadOf(report, 'src/index.ts');
  const expected = ['src/index.ts', 'src/leaf.ts', 'src/middle.ts'];
  assert.deepEqual([...load.eagerSourceFiles].sort(), expected);
  assert.deepEqual([...load.potentialSourceFiles].sort(), expected);
});

test('literal lazy imports extend only the potential closure including their dependencies', () => {
  const report = observe({
    'src/index.ts': "export { middle } from './middle.js'; export async function load() { return import('./lazy.js'); }",
    'src/middle.ts': "import { leaf } from './leaf.js'; export const middle = leaf;",
    'src/leaf.ts': 'export const leaf = 1;',
    'src/lazy.ts': "import { extra } from './lazy-leaf.js'; export const lazy = extra;",
    'src/lazy-leaf.ts': 'export const extra = 1;',
  });
  const load = loadOf(report, 'src/index.ts');
  assert.deepEqual([...load.eagerSourceFiles].sort(), ['src/index.ts', 'src/leaf.ts', 'src/middle.ts']);
  assert.deepEqual([...load.potentialSourceFiles].sort(),
    ['src/index.ts', 'src/lazy-leaf.ts', 'src/lazy.ts', 'src/leaf.ts', 'src/middle.ts']);
});
