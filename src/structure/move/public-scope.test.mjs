import assert from 'node:assert/strict';
import test from 'node:test';
import { publishedScope,nestedPackagePath } from './public-scope.mjs';

const context=metadata=>({files:new Map([['package.json',{text:JSON.stringify(metadata)}],['src/index.ts',{text:''}]])});

test('a finite explicit package entry map proves only its mapped source entry set',()=>{
  const result=publishedScope(context({exports:{'.':'./dist/index.js'}}));
  assert.equal(result.closed,true);
  assert.deepEqual([...result.paths],['src/index.ts']);
});

test('wildcards and unresolved declaration/build targets remain unproved privacy',()=>{
  assert.equal(publishedScope(context({exports:{'./*':'./dist/*.js'}})).closed,false);
  assert.equal(publishedScope(context({exports:{types:'./dist/types/index.d.ts',default:'./dist/index.js'}})).closed,false);
  assert.equal(publishedScope(context({main:'./dist/index.js'})).closed,false);
  assert.equal(publishedScope(context({exports:{'.':'./dist/index.js','./package.json':'./package.json'}})).closed,false);
});

test('a child package boundary is distinct from an ordinary folder below a root package',()=>{
  const source={files:new Map([['package.json',{text:'{}'}],['src/nested/package.json',{text:'{}'}]])};
  assert.equal(nestedPackagePath(source,'src/nested/src/foo.ts'),'src/nested/package.json');
  assert.equal(nestedPackagePath(source,'src/ordinary/foo.ts'),null);
});
