import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { snapshot } from './testing.fixture.mjs';

function moved(body) {
  return {base:snapshot({'src/a.ts':body}),head:snapshot({'src/a.ts':'',
    'src/a/helper.ts':body.replace(/^(function|const)/,'export $1')})};
}

for(const body of ['function helper(){return import.meta.url;}', 'const helper=()=>this;',
  'const helper=()=>arguments;', 'const helper=()=>new.target;', 'function helper(){return __filename;}']){
  test(`module-captured context remains incomplete after moving: ${body}`,()=>{
    const result=verifyMove(moved(body));
    assert.deepEqual(result.findings,[]);
    assert.equal(result.coverage.complete,false);
    assert.ok(result.coverage.unverified.some(item=>item.kind==='move-module-context'));
  });
}

for(const body of ['function helper(){return this;}', 'function helper(){return ()=>this;}',
  'const helper=function(){return this;};']){
  test(`an ordinary own-function this binding survives whole-unit movement: ${body}`,()=>{
    const result=verifyMove(moved(body));
    assert.deepEqual(result.findings,[]);
    assert.equal(result.coverage.complete,true);
  });
}

test('an explicitly local module-like spelling is not an implicit module capture',()=>{
  const base="const __dirname='fixed';const helper=()=>__dirname;";
  const result=verifyMove({base:snapshot({'src/a.ts':base}),head:snapshot({'src/a.ts':'',
    'src/a/helper.ts':base.replace('const helper','export const helper')})});
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,true);
});

test('identical bare imports across an existing nested package boundary cannot prove the same external owner',()=>{
  const packages={'package.json':'{"dependencies":{"dep":"1"}}','src/nested/package.json':'{"dependencies":{"dep":"2"}}'};
  const helper='function helper(value){return convert(value);}';
  const run='export function run(value){return helper(value);}';
  const result=verifyMove({base:snapshot({...packages,'src/service.ts':`import {convert} from 'dep';${helper}${run}`}),
    head:snapshot({...packages,'src/service.ts':`import {helper} from './nested/helper.js';${run}`,
      'src/nested/helper.ts':`import {convert} from 'dep';export ${helper}`})});
  assert.deepEqual(result.findings,[]);
  assert.equal(result.coverage.complete,false);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-package-context'));
});

test('a forced module-format change is an environment uncertainty even for identical statements',()=>{
  const result=verifyMove({base:snapshot({'src/helper.mjs':'function helper(){return 1;}'}),
    head:snapshot({'src/helper.mjs':'','src/helper.cjs':'function helper(){return 1;}'})});
  assert.deepEqual(result.findings,[]);
  assert.ok(result.coverage.unverified.some(item=>item.kind==='move-module-context'));
});
