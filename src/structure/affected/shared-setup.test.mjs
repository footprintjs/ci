import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './index.mjs';

test('unresolved loading in configured shared setup cannot exclude any known test', () => {
  const files={'vitest.config.ts':"export default {test:{include:['test/**/*.test.ts'],setupFiles:['test/setup.ts']}};",
    'test/setup.ts':'import(chosen);','test/one.test.ts':'assert(true);','test/two.test.ts':'assert(true);',
    'src/leaf.ts':'export const value=1;'};
  const snapshot=values=>({files:Object.entries(values).map(([path,text])=>({path,text}))});
  const result=affectedTests(snapshot({...files,'src/leaf.ts':'export const value=2;'}),snapshot(files));
  assert.deepEqual(result.tests,['test/one.test.ts','test/two.test.ts']);
  assert.ok(result.reasons.some(item=>item.kind==='shared-setup-unknown'));
  assert.equal(result.coverage.complete,false);
});
