import assert from 'node:assert/strict';
import test from 'node:test';
import { overLimit } from './finding.mjs';

test('units on the same line retain distinct comparable debt identities', () => {
  const source = { path: 'src/a.ts' };
  const first = overLimit(source, { identity: 'state:first', kind: 'state', line: 1 }, { rule: 'module-state', value: 1, limit: 0 })[0];
  const second = overLimit(source, { identity: 'state:second', kind: 'state', line: 1 }, { rule: 'module-state', value: 1, limit: 0 })[0];
  assert.notEqual(first.unitId, second.unitId);
  assert.equal(first.excess, 1);
  assert.deepEqual(overLimit(source, {}, { rule: 'test', value: 10, limit: 10 }), []);
});
