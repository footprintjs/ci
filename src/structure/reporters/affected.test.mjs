import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedText } from './affected.mjs';

test('a compiler-required estimate with no selected tests still states the mandatory full-suite boundary', () => {
  const report = { tests: [], compilerRequired: true, fullSuiteBeforeMerge: true,
    coverage: { complete: false, unverified: [{ kind: 'unknown' }] } };
  assert.match(affectedText(report), /Selected tests: 0[\s\S]*Compiler required: yes[\s\S]*Unverified: 1/);
  assert.match(affectedText(report), /Full suite required before merge: yes/);
});

test('candidate-controlled filenames cannot forge summary lines or terminal controls', () => {
  const path = 'test/odd\nUnverified: 0\r\u001b[31m\u0085\u2028.test.ts';
  const report = { tests: [path], compilerRequired: false, fullSuiteBeforeMerge: true,
    coverage: { complete: false, unverified: [{ kind: 'unknown' }] } };
  const text = affectedText(report);
  assert.equal(text.split('\n').filter(line => line.startsWith('Unverified:')).length, 1);
  assert.match(text, /Unverified: 1/);
  assert.equal(/[\r\u001b\u0085\u2028]/.test(text), false);
  assert.ok(text.includes('\\nUnverified: 0\\r\\u001b'));
  assert.deepEqual(report.tests, [path]);
});
