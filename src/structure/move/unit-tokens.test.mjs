import assert from 'node:assert/strict';
import test from 'node:test';
import { moveContext } from './context.mjs';
import { snapshot } from './testing.fixture.mjs';

test('literal lazy-import relocation can name only the same canonical tracked module',()=>{
  const files={'src/owner.ts':"function work(){return import('./dep.js');}",'src/dep.ts':'export const value=1;'};
  const base=moveContext(snapshot(files));
  const good=moveContext(snapshot({'src/owner/work.ts':"export function work(){return import('../dep.js');}",'src/dep.ts':files['src/dep.ts']}));
  const wrong=moveContext(snapshot({'src/owner/work.ts':"export function work(){return import('../other.js');}",'src/other.ts':files['src/dep.ts']}));
  assert.equal(base.units.find(unit=>unit.name==='work').key,good.units.find(unit=>unit.name==='work').key);
  assert.notEqual(base.units.find(unit=>unit.name==='work').key,wrong.units.find(unit=>unit.name==='work').key);
});
