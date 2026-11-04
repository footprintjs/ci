import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove,changeFile } from './testing.fixture.mjs';

test('new side-effect imports and import-equals wiring cannot be excused as ancillary metadata',()=>{
  for(const addition of ["import '../index.js';", "import unused=require('../index.js');"]){
    const input=simpleMove();
    changeFile(input.head,'src/owner/work.ts',text=>`${addition}\n${text}`);
    assert.ok(verifyMove(input).coverage.unverified.some(item=>item.kind==='move-wiring'));
  }
});
