import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { comparedDoors } from './door-policy.mjs';
import { snapshot } from './testing.fixture.mjs';

test('a newly created root index remains a protected entry independent of package heuristics',()=>{
  const base=moveContext(snapshot({'src/leaf.ts':'export function work(){}'}));
  const head=moveContext(snapshot({'src/leaf.ts':'export function work(){}','src/index.ts':"export {work} from './leaf.js';"}));
  assert.equal(comparedDoors(base,head).paths.has('src/index.ts'),true);
});
