import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';

test('parse diagnostics are data while candidate code is never evaluated', () => {
  const result = snapshotContext({ files: [{ path: 'src/a.ts', text: 'throw new Error("never run"); function broken( {' }] });
  assert.ok(result.unverified.some(item => item.kind === 'parse-error' && item.path === 'src/a.ts'));
});

test('colocated tests are known while unexpressed runner discovery stays explicit', () => {
  const result = snapshotContext({ files: [{ path: 'src/a.test.ts', text: '' }, { path: 'test/custom.ts', text: '' },
    { path: 'test/helpers/factory.ts', text: '' }] });
  assert.deepEqual(result.tests, ['src/a.test.ts']);
  assert.ok(result.unverified.some(item => item.kind === 'affected-test-discovery' && item.path === 'test/custom.ts'));
});
