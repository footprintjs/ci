import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSnapshots } from './report.mjs';

const snapshot = files => ({ files: Object.entries(files).map(([path, text]) => ({ path, text })) });
const base = snapshot({ 'src/owner.ts': 'export function work() {}' });
const facade = "export { work } from './owner/work.js';";

function readers(report) {
  assert.ok(report.sourceReaders, 'missing source-reader report');
  assert.ok(report.sourceReaders.unverifiedCount === null || typeof report.sourceReaders.unverifiedCount === 'number');
  assert.ok(Array.isArray(report.sourceReaders.declarationLossLiterals), 'missing declaration-loss literal list');
  return report.sourceReaders;
}

test('reader unverified count describes current head rather than adding the base count', () => {
  const before = snapshot({ 'src/owner.ts': 'export function work() {}',
    'test/read.ts': "import { readFileSync } from 'node:fs'; readFileSync(dynamic); readFileSync(other);" });
  const current = snapshot({ 'test/read.ts': "import { readFileSync } from 'node:fs'; readFileSync('src/owner.ts');",
    'src/owner.ts': '' });
  const report = checkSnapshots(current, before);
  assert.equal(readers(report).unverifiedCount, 1);
  assert.equal(report.coverage.unverified.filter(item => item.kind === 'source-reader').length, 3);
});

test('declaration loss lists test and script literal sites without inferring reader intent', () => {
  const report = checkSnapshots(snapshot({ 'src/owner.ts': facade,
    'src/owner/work.ts': 'export function work() {}',
    'test/read.ts': "const target = 'src/owner.ts';",
    'scripts/check.mjs': "const target = '../src/owner.ts';",
    'src/consumer.ts': "const data = 'src/owner.ts';" }), base);
  assert.deepEqual(readers(report).declarationLossLiterals, [
    { path: 'scripts/check.mjs', line: 1, target: 'src/owner.ts', declarations: ['work'] },
    { path: 'test/read.ts', line: 1, target: 'src/owner.ts', declarations: ['work'] },
  ]);
  assert.deepEqual(report.findings.filter(item => ['stale-path', 'citation-owner'].includes(item.rule)), []);
  assert.equal(readers(report).unverifiedCount, 0, 'a literal alone is not a filesystem reader');
});

test('an unchanged declaration name, even with a changed body, does not create a loss hint', () => {
  const report = checkSnapshots(snapshot({ 'src/owner.ts': 'export function work() { changed(); }',
    'test/read.ts': "const target = 'src/owner.ts';" }), base);
  assert.deepEqual(readers(report).declarationLossLiterals, []);
});

test('the advisory list also covers a removed source file and does not require a surviving facade', () => {
  const report = checkSnapshots(snapshot({ 'test/read.ts': "const target = 'src/owner.ts';" }), base);
  assert.deepEqual(readers(report).declarationLossLiterals, [
    { path: 'test/read.ts', line: 1, target: 'src/owner.ts', declarations: ['work'] },
  ]);
});

test('without a base, no declaration loss is asserted', () => {
  const report = checkSnapshots(snapshot({ 'src/owner.ts': facade, 'test/read.ts': "const target = 'src/owner.ts';" }), null);
  assert.deepEqual(readers(report).declarationLossLiterals, []);
});
