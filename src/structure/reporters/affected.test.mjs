import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedText } from './affected.mjs';

test('a compiler-only estimate still states the mandatory full-suite boundary', () => {
  const report = { tests: [], compilerRequired: true, fullSuiteBeforeMerge: true,
    coverage: { complete: false, unverified: [{ kind: 'unknown' }] } };
  assert.match(affectedText(report), /Selected tests: 0[\s\S]*Compiler required: yes[\s\S]*Unverified: 1/);
  assert.match(affectedText(report), /Full suite required before merge: yes/);
});
