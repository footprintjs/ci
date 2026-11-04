import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove, changeFile } from './testing.fixture.mjs';

test('an unexplained new unused import is not silently treated as moved wiring', () => {
  const input=simpleMove();
  for(const snapshot of [input.base,input.head])snapshot.files.push({path:'src/deps.ts',text:'export function extra(){}'});
  changeFile(input.head,'src/owner/work.ts',text=>"import {extra} from '../deps.js';\n"+text);
  const result=verifyMove(input);
  assert.equal(result.coverage.complete,false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-wiring'));
});

test('moving a load-bearing initializer remains incomplete without executing it', () => {
  const input=simpleMove();
  changeFile(input.base,'src/owner.ts',text=>`const ready=initialize();\n${text}`);
  changeFile(input.head,'src/owner/work.ts',text=>`const ready=initialize();\n${text}`);
  assert.ok(verifyMove(input).coverage.unverified.some(item=>item.kind==='load-order'));
});
