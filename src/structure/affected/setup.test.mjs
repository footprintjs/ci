import assert from 'node:assert/strict';
import test from 'node:test';
import { affectedTests } from './index.mjs';

const snapshot = files => ({files:Object.entries(files).map(([path,text])=>({path,text}))});
const baseFiles = setup => ({'vitest.config.ts':`export default {test:{include:['test/**/*.test.ts'], ${setup}}};`,
  'src/leaf.ts':'export const value = 1;', 'test/setup.ts':"import { value } from '../src/leaf.js'; assert(value);",
  'test/one.test.ts':'assert(true);', 'test/two.test.ts':'assert(true);'});

for (const field of ["setupFiles: ['./test/setup.ts']", "globalSetup: 'test/setup.ts'"]) {
  test(`literal shared setup dependencies select all their consumers: ${field}`, () => {
    const base=baseFiles(field);
    const result=affectedTests(snapshot({...base,'src/leaf.ts':'export const value = 2;'}),snapshot(base));
    assert.deepEqual(result.tests,['test/one.test.ts','test/two.test.ts']);
    assert.ok(result.reasons.some(item=>item.kind==='shared-setup-dependency'&&item.changed==='src/leaf.ts'));
  });
}

test('shared dynamic readers remain always-run and explicitly labeled', () => {
  const base={...baseFiles("setupFiles: ['test/setup.ts']"),
    'test/setup.ts':"import { readFileSync } from 'node:fs'; readFileSync(chosen);"};
  const result=affectedTests(snapshot({...base,'src/leaf.ts':'export const value = 2;'}),snapshot(base));
  assert.deepEqual(result.alwaysRun,['test/one.test.ts','test/two.test.ts']);
  assert.ok(result.reasons.some(item=>item.kind==='shared-setup-always-run'));
});

test('dynamic or missing setup roots cannot be excluded from test selection', () => {
  for(const setup of ['setupFiles: chooseSetup()', "globalSetup: ['test/missing.ts']"]){
    const base=baseFiles(setup);
    const result=affectedTests(snapshot({...base,'src/leaf.ts':'export const value = 2;'}),snapshot(base));
    assert.deepEqual(result.tests,['test/one.test.ts','test/two.test.ts']);
    assert.ok(result.coverage.unverified.some(item=>item.kind==='affected-test-discovery'));
  }
});
