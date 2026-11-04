import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove, changeFile } from './testing.fixture.mjs';

function documentedType() {
  const input=simpleMove();
  for(const snapshot of [input.base,input.head])snapshot.files.push({path:'src/types.ts',text:'export interface Shape {value:string}'});
  changeFile(input.base,'src/owner.ts',text=>"import type {Shape} from './types.js';\n"+text.replace('Work docs.','Work docs. {@link Shape.value}'));
  changeFile(input.head,'src/owner/work.ts',text=>text.replace('Work docs.','Work docs. {@link Shape.value}'));
  return input;
}

test('a JSDoc-only dependency missing after a move stays incomplete', () => {
  const result=verifyMove(documentedType());
  assert.equal(result.coverage.complete,false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-jsdoc-binding'));
});

test('a JSDoc-only dependency can preserve its canonical imported owner', () => {
  const input=documentedType();
  changeFile(input.head,'src/owner/work.ts',text=>"import type {Shape} from '../types.js';\n"+text);
  const result=verifyMove(input);
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.unverified.some(item=>item.kind==='move-jsdoc-binding'),false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-jsdoc-emission'));
});

test('an ambiguous lexical global spelling is not replaced by an assumed intrinsic', () => {
  const input=simpleMove();
  for(const snapshot of [input.base,input.head])changeFile(snapshot,'src/index.ts',()=>
    'const Array=1; const Array=2; export function observe(){return Array;}');
  const result=verifyMove(input);
  assert.equal(result.coverage.complete,false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-binding'));
});
