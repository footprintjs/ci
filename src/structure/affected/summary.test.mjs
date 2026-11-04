import assert from 'node:assert/strict';
import test from 'node:test';
import { selectionSummary } from './summary.mjs';

test('reason counts deduplicate selected tests per kind while preserving overlapping reasons', () => {
  const result = selectionSummary({ tests: ['a.test.ts', 'b.test.ts'], reasons: [
    {test:'a.test.ts',kind:'runtime-dependency'}, {test:'a.test.ts',kind:'runtime-dependency'},
    {test:'a.test.ts',kind:'always-run'}, {test:'b.test.ts',kind:'runtime-dependency'},
    {test:null,kind:'deleted-test'}, {test:'removed.test.ts',kind:'deleted-test'},
  ] }, ['a.test.ts', 'b.test.ts', 'c.test.ts']);
  assert.deepEqual(result, {selected:2,known:3,byReason:{'always-run':1,'runtime-dependency':2}});
});
