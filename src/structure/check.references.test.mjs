import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';
import { finding, noFindings, reportOf, snapshot, unverified } from './check.fixture.mjs';

const observe = files => reportOf(checkStructure(snapshot(files)));
const moved = {
  'src/owner.ts': "export { work } from './owner/work.js';",
  'src/owner/work.ts': 'export function work() {}',
};

test('a synthetic source path in ordinary string data is not a live citation', () => {
  const report = observe({ 'src/fixtures.ts': "export const sample = 'src/imaginary.ts';" });
  noFindings(report, ['stale-path', 'citation-owner']);
});

test('live documentation naming a missing source path reports stale-path', () => {
  finding(observe({ 'docs/guide.md': 'The implementation is `src/missing.ts`.' }), 'stale-path', 'docs/guide.md');
});

test('a surviving old facade cannot satisfy a declaration-owner citation', () => {
  const report = observe({ ...moved, 'docs/guide.md': 'The owner is `src/owner.ts` · `work`.' });
  finding(report, 'citation-owner', 'docs/guide.md');
});

test('the same citation to the moved declaration owner is admitted', () => {
  noFindings(observe({ ...moved, 'docs/guide.md': 'The owner is `src/owner/work.ts` · `work`.' }),
    ['stale-path', 'citation-owner']);
});

test('comments strings and imported names do not establish declaration ownership', () => {
  const impostors = [
    '// function work() {}',
    'const sentence = "function work() {}";',
    "import { work } from './real.js';",
  ];
  for (const source of impostors) {
    const report = observe({ 'src/impostor.ts': source, 'src/real.ts': 'export function work() {}',
      'docs/guide.md': 'The owner is `src/impostor.ts` · `work`.' });
    finding(report, 'citation-owner', 'docs/guide.md');
  }
});

test('a real qualified class method is declaration ownership rather than raw text occurrence', () => {
  const report = observe({ 'src/runner.ts': 'export class Runner { run() {} }',
    'docs/guide.md': 'The entry is `src/runner.ts` · `Runner.run`.' });
  noFindings(report, ['stale-path', 'citation-owner']);
});

test('an ambiguous basename is not silently accepted as an owner', () => {
  const report = observe({ 'src/left/owner.ts': 'export function work() {}',
    'src/right/owner.ts': 'export function work() {}', 'docs/guide.md': 'The owner is `owner.ts` · `work`.' });
  unverified(report, 'citation-owner', 'docs/guide.md');
});

test('dynamic source readers report incomplete coverage instead of a fabricated verification', () => {
  const reader = `import { readFileSync } from 'node:fs'; const previousOwner = 'src/owner.ts';
    export function readOwner(path: string) { return readFileSync(path, 'utf8'); }`;
  const before = { 'src/owner.ts': 'export function work() {}', 'test/reader.ts': reader };
  const report = reportOf(checkStructure(snapshot({ ...moved, 'test/reader.ts': reader }), snapshot(before, 'base')));
  unverified(report, 'source-reader', 'test/reader.ts');
  assert.deepEqual(report.sourceReaders.analyzedPaths, ['test/reader.ts']);
  noFindings(report, ['stale-path']);
});

test('an aliased promised file reader with a dynamic path is also incomplete', () => {
  const reader = `import { readFile as sourceText } from 'node:fs/promises'; const previousOwner = 'src/owner.ts';
    export async function readOwner(path: string) { return sourceText(path, 'utf8'); }`;
  const before = { 'src/owner.ts': 'export function work() {}', 'test/reader.ts': reader };
  const report = reportOf(checkStructure(snapshot({ ...moved, 'test/reader.ts': reader }), snapshot(before, 'base')));
  unverified(report, 'source-reader', 'test/reader.ts');
  assert.deepEqual(report.sourceReaders.analyzedPaths, ['test/reader.ts']);
  noFindings(report, ['stale-path']);
});

test('a constant source reader path is checked for existence', () => {
  const reader = `import { readFileSync } from 'node:fs'; readFileSync('src/removed.ts', 'utf8');`;
  const before = { 'src/removed.ts': 'export function work() {}', 'test/reader.ts': reader };
  const report = reportOf(checkStructure(snapshot({ 'test/reader.ts': reader }), snapshot(before, 'base')));
  finding(report, 'stale-path', 'test/reader.ts');
  assert.deepEqual(report.sourceReaders.analyzedPaths, ['test/reader.ts']);
});

test('CHANGELOG and dated design references are counted separately from live findings', () => {
  const report = observe({ 'CHANGELOG.md': 'Earlier code lived in `src/old.ts` · `oldWork`.',
    'docs/design/2026-10-old.md': 'The design used `src/removed.ts`.' });
  noFindings(report, ['stale-path', 'citation-owner']);
  for (const path of ['CHANGELOG.md', 'docs/design/2026-10-old.md']) {
    assert.ok(report.historicalReferences.some(item => item.path === path), `missing historical observation: ${path}`);
  }
});

test('an undated active design page is not hidden in the historical bucket', () => {
  finding(observe({ 'docs/design/current.md': 'The owner is `src/missing.ts`.' }),
    'stale-path', 'docs/design/current.md');
});
