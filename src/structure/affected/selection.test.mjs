import assert from 'node:assert/strict';
import test from 'node:test';
import { snapshotContext } from './context.mjs';
import { selectTests } from './selection.mjs';

test('changed and deleted test reasons are distinct and only head tests are runnable', () => {
  const head = snapshotContext({ files: [{ path: 'test/new.test.ts', text: '' }] });
  const base = snapshotContext({ files: [{ path: 'test/old.test.ts', text: '' }] });
  const result = selectTests(head, base, { paths: ['test/new.test.ts', 'test/old.test.ts'], runtime: [], full: [] });
  assert.deepEqual(result.tests, ['test/new.test.ts']);
  assert.ok(result.reasons.some(item => item.kind === 'deleted-test' && item.test === null));
  assert.ok(result.reasons.some(item => item.kind === 'changed-test' && item.test === 'test/new.test.ts'));
});
