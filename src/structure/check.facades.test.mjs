import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';
import { finding, noFindings, reportOf, snapshot } from './check.fixture.mjs';

const FACADE_RULES = ['facade-lines', 'facade-complexity', 'facade-runtime'];
const observe = files => reportOf(checkStructure(snapshot(files)));
const sibling = source => ({ 'src/work.ts': source, 'src/work/leaf.ts': 'export function leaf() {}' });
const wire = lines => ['export function work() {', ...Array(lines - 2).fill('  leaf();'), '}'].join('\n');

test('sibling facade allows exactly five code lines and one path', () => {
  noFindings(observe(sibling(`import { leaf } from './work/leaf.js';\n${wire(5)}`)), FACADE_RULES);
});

test('sibling facade rejects six code lines without adding a branch', () => {
  finding(observe(sibling(`import { leaf } from './work/leaf.js';\n${wire(6)}`)), 'facade-lines', 'src/work.ts');
});

test('sibling facade rejects a second path inside a short function', () => {
  const source = "import { leaf } from './work/leaf.js';\nexport function work() {\n  if (ready) leaf();\n}";
  finding(observe(sibling(source)), 'facade-complexity', 'src/work.ts');
});

test('facade type declarations and pure reexports stay admitted', () => {
  const report = observe(sibling("export interface Options { value: string }\nexport { leaf } from './work/leaf.js';"));
  noFindings(report, FACADE_RULES);
});

test('facade runtime constant initialization is reported as business logic', () => {
  finding(observe(sibling('export const cache = new Map();')), 'facade-runtime', 'src/work.ts');
});

test('folder index is a facade without a same-named child directory', () => {
  const report = observe({ 'src/domain/index.ts': wire(6), 'src/domain/leaf.ts': 'export function leaf() {}' });
  finding(report, 'facade-lines', 'src/domain/index.ts');
});

test('top-level package doors follow the same facade boundary', () => {
  const report = observe({
    'package.json': JSON.stringify({ exports: { './trace': './dist/trace.js' } }),
    'src/trace.ts': wire(6),
  });
  finding(report, 'facade-lines', 'src/trace.ts');
});

test('a nonfacade nested module retains the general function boundary', () => {
  const report = observe({ 'src/domain/work.ts': wire(6) });
  noFindings(report, FACADE_RULES);
  assert.ok(Array.isArray(report.findings));
});

test('class method wiring has the same five-line facade boundary', () => {
  const report = observe(sibling(['export class Work {', '  run() {',
    '    leaf();', '    leaf();', '    leaf();', '    leaf();', '  }', '}'].join('\n')));
  finding(report, 'facade-lines', 'src/work.ts');
});
