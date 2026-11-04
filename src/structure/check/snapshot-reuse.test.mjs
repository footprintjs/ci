import assert from 'node:assert/strict';
import test from 'node:test';
import { observeSnapshotContext, snapshotContexts } from './snapshot.mjs';
import { readerComparison } from '../references/reader-comparison.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });

test('a comparison retains one syntax tree per unchanged path and text, including readers', () => {
  const input = snapshot({ 'src/work.ts': 'export function work(){return 1;}', 'docs/readme.md': 'Source documentation.',
    'test/read.ts': "import {readFileSync} from 'node:fs'; readFileSync('src/work.ts');" });
  const { headContext: head, baseContext: base } = snapshotContexts(input, input);
  assert.equal(new Set([...head.parsed.values(), ...base.parsed.values()]).size, 2);
  assert.equal(head.parsed.has('docs/readme.md'), false);
  assert.notEqual(head.files, base.files);
  assert.notEqual(head.report, base.report);
  assert.deepEqual(head.report, base.report);
});

test('syntax reuse rejects changed text and changed path and retains this snapshot metadata', () => {
  const text = 'export function work(){return 1;}';
  const head = observeSnapshotContext(snapshot({ 'src/work.ts': text }));
  const base = observeSnapshotContext({ files: [
    { path: 'src/work.ts', text, mode: '100755', oid: 'base' },
    { path: 'src/other.ts', text },
  ] }, head.parsed);
  assert.ok(base.parsed.get('src/work.ts') === head.parsed.get('src/work.ts'));
  assert.notEqual(base.parsed.get('src/other.ts'), head.parsed.get('src/work.ts'));
  assert.equal(base.files.get('src/work.ts').mode, '100755');
  assert.equal(head.files.get('src/work.ts').mode, undefined);
  const changed = observeSnapshotContext(snapshot({ 'src/work.ts': text.replace('1', '2') }), head.parsed);
  assert.notEqual(changed.parsed.get('src/work.ts'), head.parsed.get('src/work.ts'));
  assert.notDeepEqual(changed.report, head.report);
});

test('shared syntax does not reuse graph, citation owners or reader results', () => {
  const files = { 'package.json': JSON.stringify({ exports: './src/index.ts' }),
    'src/index.ts': "export {work} from './work.js';",
    'src/work.ts': 'export function work(){return 1;}',
    'docs/use.md': 'See `src/work.ts#work`.',
    'test/read.ts': "import {readFileSync} from 'node:fs'; readFileSync('src/work.ts');" };
  const headInput = snapshot({ ...files, 'src/work.ts': "export {work} from './next.js';",
    'src/next.ts': 'export function work(){return 1;}' });
  const baseInput = snapshot(files);
  const head = observeSnapshotContext(headInput);
  const fresh = observeSnapshotContext(baseInput);
  const shared = observeSnapshotContext(baseInput, head.parsed);
  assert.ok(shared.parsed.get('src/index.ts') === head.parsed.get('src/index.ts'));
  assert.ok(shared.parsed.get('test/read.ts') === head.parsed.get('test/read.ts'));
  assert.deepEqual(shared.report, fresh.report);
  const observed = readerComparison(head, shared);
  assert.deepEqual(observed, readerComparison(head, fresh));
  assert.deepEqual(observed.current.sourceReaders.analyzedPaths, ['test/read.ts']);
});

test('unchanged sources recompute changed package doors and same-stem folder roles', () => {
  const files = { 'package.json': JSON.stringify({ exports: './src/left.ts' }),
    'src/left.ts': 'export const left=1;', 'src/right.ts': 'export const right=2;' };
  const head = observeSnapshotContext(snapshot({ ...files,
    'package.json': JSON.stringify({ exports: './src/right.ts' }), 'src/right/leaf.ts': 'export const leaf=3;' }));
  const fresh = observeSnapshotContext(snapshot(files));
  const shared = observeSnapshotContext(snapshot(files), head.parsed);
  assert.ok(shared.parsed.get('src/right.ts') === head.parsed.get('src/right.ts'));
  assert.deepEqual(shared.report, fresh.report);
  assert.deepEqual(shared.report.loads.map(item => item.path), ['src/left.ts']);
  assert.deepEqual(head.report.loads.map(item => item.path), ['src/right.ts']);
});

test('an unchanged forwarder resolves changed target export kind for each snapshot', () => {
  const files = { 'src/use.ts': "export {value} from './dep.js';",
    'src/dep.ts': 'export const value=1;' };
  const head = observeSnapshotContext(snapshot({ ...files, 'src/dep.ts': 'export type value=number;' }));
  const fresh = observeSnapshotContext(snapshot(files));
  const shared = observeSnapshotContext(snapshot(files), head.parsed);
  assert.ok(shared.parsed.get('src/use.ts') === head.parsed.get('src/use.ts'));
  assert.deepEqual(shared.report, fresh.report);
  assert.notDeepEqual(shared.report.graph, head.report.graph);
});
