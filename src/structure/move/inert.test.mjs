import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { inertUnit } from './inert.mjs';

test('the finite inert grammar accepts declarations and constant literal/function initialization',()=>{
  const source=parseSource({path:'src/a.ts',text:'function work(){} interface Shape{} type Name=string; declare const port:unknown; const text="kept"; const run=()=>1;'});
  assert.equal(source.sourceFile.statements.length,6);
  assert.ok([...source.sourceFile.statements].every(inertUnit));
});

test('calls mutable initialization and class static execution are never credited as inert',()=>{
  const source=parseSource({path:'src/a.ts',text:'const state=make(); let count=0; class Cache {static {register();}}'});
  assert.deepEqual([...source.sourceFile.statements].map(inertUnit),[false,false,false]);
});
