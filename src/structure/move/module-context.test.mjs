import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { moduleCaptures } from './module-context.mjs';
import { snapshot } from './testing.fixture.mjs';

const captures=text=>moduleCaptures(moveContext(snapshot({'src/a.ts':text})).units[0]);

test('arrows inherit module this while normal function boundaries preserve their own context',()=>{
  assert.deepEqual(captures('const helper=()=>this;'),['lexical this']);
  assert.deepEqual(captures('function helper(){return ()=>this;}'),[]);
  assert.deepEqual(captures('function helper(){return new.target;}'),[]);
});

test('module metadata remains contextual inside an ordinary function and local names remain lexical',()=>{
  assert.deepEqual(captures('function helper(){return import.meta.url;}'),['import.meta']);
  assert.deepEqual(captures('function helper(__filename){return __filename;}'),[]);
});
