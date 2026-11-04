import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot } from './testing.fixture.mjs';

test('an own generic type parameter does not capture an obsolete same-spelled type import',()=>{
  const fn='function work<T>(value:T):T{return value;}';
  const files={'src/types.ts':'export interface T{}','src/owner.ts':`import type {T} from './types.js'; ${fn}`};
  const result=verifyMove({base:snapshot(files),head:snapshot({'src/types.ts':files['src/types.ts'],
    'src/owner.ts':"import {work} from './owner/work.js';",'src/owner/work.ts':`export ${fn}`})});
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
});

test('a same-spelled generic parameter cannot hide a changed runtime import owner',()=>{
  const fn='function work<T>(){return T();}';
  const deps={'src/first.ts':'export function T(){return 1;}','src/second.ts':'export function T(){return 2;}'};
  const result=verifyMove({base:snapshot({...deps,'src/owner.ts':`import {T} from './first.js';${fn}`}),
    head:snapshot({...deps,'src/owner.ts':"import {work} from './owner/work.js';",
      'src/owner/work.ts':`import {T} from '../second.js';export ${fn}`})});
  assert.ok(result.findings.some(item=>item.rule==='move-imports'));
});

test('a literal import-type path can relocate to the same tracked declaration owner',()=>{
  const body="function work(value:import('./types.js').Shape){return value;}";
  const type='export interface Shape {value:string}';
  const result=verifyMove({base:snapshot({'src/owner.ts':body,'src/types.ts':type}),
    head:snapshot({'src/owner.ts':"import {work} from './owner/work.js';",'src/types.ts':type,
      'src/owner/work.ts':`export ${body.replace('./types.js','../types.js')}`})});
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
});

test('a top-level destructured binding keeps its name when the whole statement moves',()=>{
  const declaration='declare const input:{first:number}; const {first:chosen}=input;';
  const run='export function run(){return chosen;}';
  const result=verifyMove({base:snapshot({'src/owner.ts':`${declaration}${run}`}),
    head:snapshot({'src/owner.ts':`import {chosen} from './owner/chosen.js';${run}`,
      'src/owner/chosen.ts':declaration.replace('const {first:chosen}','export const {first:chosen}')})});
  assert.deepEqual(result.findings,[]);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='load-order'));
});
