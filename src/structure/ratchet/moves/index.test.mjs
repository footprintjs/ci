import test from 'node:test';
import assert from 'node:assert/strict';
import { observeSnapshotContext } from '../../check/snapshot.mjs';
import { movedFileEvidence, wiringAllowances } from './index.mjs';

const context = files => observeSnapshotContext({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });

test('a whole exported declaration keeps its old private body, while a copy cannot reuse it', () => {
  const before = context({ 'src/old.ts': 'function work() { return 1; }' });
  const after = context({ 'src/old.ts': '', 'src/new.ts': 'export function work() { return 1; }' });
  assert.ok(movedFileEvidence(after, before).has('src/new.ts'));
  const copied = context({ 'src/old.ts': 'function work() { return 1; }',
    'src/new.ts': 'export function work() { return 1; }' });
  assert.equal(movedFileEvidence(copied, before).has('src/new.ts'), false);
});

test('renaming, partial bodies and new wrapper-only barrels do not prove top-level relocation', () => {
  const before = context({ 'src/old.ts': 'function work() { const value = 1; return value; }' });
  for (const text of ['export function other() { const value = 1; return value; }',
    'export function work() { return 1; }', "export { work } from './old.js';"]) {
    assert.equal(movedFileEvidence(context({ 'src/new.ts': text }), before).has('src/new.ts'), false);
  }
});

test('ambient variable declarations cannot excuse a new runtime declaration', () => {
  const before = context({ 'src/old.ts': 'declare let value: Shape;' });
  assert.equal(movedFileEvidence(context({ 'src/new.ts': 'let value: Shape;' }), before).has('src/new.ts'), false);
  assert.equal(movedFileEvidence(context({ 'src/new.ts': 'export declare let value: Shape;' }), before).has('src/new.ts'), true);
});

test('wiring credit also records crossing the import limit and excludes uncertain edges', () => {
  const make = (count, codeLines) => ({ report: { measurements: [{ path: 'src/a.ts', codeLines }],
    graph: { edges: Array.from({ length: count }, () => ({ from: 'src/a.ts', unverified: false })) } } });
  const before = make(19, 100);
  const after = make(22, 99);
  after.report.graph.edges.at(-1).unverified = true;
  const evidence = wiringAllowances(after, before).get('src/a.ts');
  assert.equal(evidence.allowedGrowth, 1);
  assert.equal(evidence.imports, 21);
  assert.equal(wiringAllowances(make(22, 100), before).size, 0);
});
