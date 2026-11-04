import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStructure } from './check.mjs';

const ownerFiles = [
  { path: 'src/owner.ts', text: "export { work } from './owner/work.js';" },
  { path: 'src/owner/work.ts', text: 'export function work() {}' },
];

function observed(readerText) {
  const report = checkStructure({ id: 'reader-intent', files: [...ownerFiles,
    { path: 'test/read.ts', text: readerText }] });
  assert.ok(report && Array.isArray(report.findings), 'missing structure findings');
  assert.ok(report.coverage && Array.isArray(report.coverage.unverified), 'missing structure coverage');
  return report;
}

function readerUnknown(report) {
  assert.equal(report.coverage.complete, false);
  assert.ok(report.coverage.unverified.some(item => item.kind === 'source-reader' && item.path === 'test/read.ts'
    && typeof item.reason === 'string' && /intent|ownership/i.test(item.reason)), 'missing reader-intent qualification');
}

test('a surviving old facade does not make an unexpressed declaration-reader intent complete', () => {
  const report = observed(`import { readFileSync } from 'node:fs';
    const source = readFileSync('src/owner.ts', 'utf8');
    if (!source.includes('function work')) throw new Error('expected work declaration');`);
  readerUnknown(report);
  assert.deepEqual(report.findings.filter(item => ['stale-path', 'citation-owner'].includes(item.rule)), []);
});

test('legitimate whole-file byte inspection is qualified rather than accused of a wrong owner', () => {
  const report = observed(`import { readFileSync } from 'node:fs';
    const source = readFileSync('src/owner.ts'); if (source.byteLength !== expected) fail();`);
  readerUnknown(report);
  assert.deepEqual(report.findings, []);
});

test('missing source paths retain definite stale-path evidence independently from reader intent', () => {
  const report = observed("import { readFileSync } from 'node:fs'; readFileSync('src/missing.ts', 'utf8');");
  assert.ok(report.findings.some(item => item.rule === 'stale-path' && item.path === 'test/read.ts'));
});

test('plain synthetic source strings without a filesystem reader do not manufacture intent obligations', () => {
  const report = observed("const sample = 'src/imaginary.ts'; const expected = 'function work';");
  assert.deepEqual(report.coverage.unverified.filter(item => item.kind === 'source-reader'), []);
  assert.deepEqual(report.findings.filter(item => ['stale-path', 'citation-owner'].includes(item.rule)), []);
});
