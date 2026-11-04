import assert from 'node:assert/strict';
import test from 'node:test';
import { setupRoots } from './setup-roots.mjs';

test('setup roots resolve tracked source extensions without evaluating the file', () => {
  const result=setupRoots({paths:['vitest.config.ts'],setups:['./test/setup.js']},new Map([['test/setup.ts',{text:'throw new Error("never run")'}]]));
  assert.deepEqual(result,{paths:['test/setup.ts']});
});

test('external, missing and escaping setup roots stay unsupported', () => {
  for(const value of ['/tmp/setup.ts','../setup.ts','missing.ts'])assert.ok(setupRoots({paths:['vitest.config.ts'],setups:[value]},new Map()).reason);
});
