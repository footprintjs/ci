import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove,changeFile,snapshot } from './testing.fixture.mjs';

for(const keyword of ['assert','with'])for(const operation of ['import','export'])for(const direction of ['add','remove']){
  test(`${direction} ${operation} ${keyword} attributes needs module metadata proof`,()=>{
    const plain=operation==='import'?"import {value} from './dep.js';":"export {value} from './dep.js';";
    const attributed=plain.replace(';',` ${keyword} {type:'json'};`);
    const shared={'src/dep.ts':'export function value(){return 1;}'};
    const suffix=operation==='import'?'export function run(){return value();}':'';
    const before=direction==='add'?plain:attributed,after=direction==='add'?attributed:plain;
    const result=verifyMove({base:snapshot({...shared,'src/a.ts':before+suffix}),
      head:snapshot({...shared,'src/a.ts':after+suffix})});
    assert.deepEqual(result.findings,[]);
    assert.equal(result.coverage.complete,false);
    assert.ok(result.coverage.unverified.some(item=>item.kind==='move-wiring-attributes'&&item.path==='src/a.ts'));
  });
}

test('new side-effect imports and import-equals wiring cannot be excused as ancillary metadata',()=>{
  for(const addition of ["import '../index.js';", "import unused=require('../index.js');"]){
    const input=simpleMove();
    changeFile(input.head,'src/owner/work.ts',text=>`${addition}\n${text}`);
    assert.ok(verifyMove(input).coverage.unverified.some(item=>item.kind==='move-wiring'));
  }
});
