import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot } from './testing.fixture.mjs';

for(const declaration of ['function helper(path){return import(path);}',
  'function helper(){return import("./missing.js");}',
  'function helper(){return import("./dep.js?query=1");}',
  'function helper(){return import("external");}',
  'function helper(){return import("./dep.js",{with:{type:"json"}});}',
  'type Helper=import("./missing.js");']){
  test(`a moved location-sensitive unresolved import remains incomplete: ${declaration}`,()=>{
    const shared={'src/dep.ts':'export function value(){return 1;}'};
    const result=verifyMove({base:snapshot({...shared,'src/a.ts':declaration}),
      head:snapshot({...shared,'src/a.ts':'','src/a/leaf.ts':`export ${declaration}`})});
    assert.deepEqual(result.findings,[]);
    assert.equal(result.coverage.complete,false);
    assert.ok(result.coverage.unverified.some(item=>item.kind==='move-module-location'));
  });
}

test('literal dynamic imports keep the same tracked owner after relative path relocation',()=>{
  const shared={'src/dep.ts':'export function value(){return 1;}'};
  const result=verifyMove({base:snapshot({...shared,'src/a.ts':'function helper(){return import("./dep.js");}'}),
    head:snapshot({...shared,'src/a.ts':'','src/a/leaf.ts':'export function helper(){return import("../dep.js");}'})});
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
});
