import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './analyze.mjs';

test('without a comparison base all known head tests are selected as an estimate', () => {
  const result = affectedTests({ files: [{ path: 'test/a.test.ts', text: 'assert(true);' }] });
  assert.deepEqual(result.tests, ['test/a.test.ts']);
  assert.equal(result.estimate, true);
  assert.equal(result.fullSuiteBeforeMerge, true);
});

test('invalid syntax and unknown runner discovery remain explicit coverage diagnostics', () => {
  const head = { files: [{ path: 'src/broken.ts', text: 'function broken( {' }, { path: 'test/custom.ts', text: '' }] };
  const result = affectedTests(head, { files: [] });
  assert.ok(result.coverage.unverified.some(item => item.kind === 'parse-error'));
  assert.ok(result.coverage.unverified.some(item => item.kind === 'affected-test-discovery'));
  assert.equal(result.coverage.complete, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
