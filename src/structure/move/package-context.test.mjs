import assert from 'node:assert/strict';
import test from 'node:test';
import { packageContext } from './package-context.mjs';

test('package identity includes existing nested boundaries even with unchanged metadata',()=>{
  const context={files:new Map([['package.json',{text:'{"dependencies":{"dep":"1"}}'}],
    ['src/nested/package.json',{text:'{"dependencies":{"dep":"2"}}'}]])};
  assert.notEqual(packageContext(context,'src/a.ts').identity,packageContext(context,'src/nested/a.ts').identity);
  assert.equal(packageContext(context,'src/a.ts').identity,packageContext(context,'src/ordinary/a.ts').identity);
});

test('malformed nested package metadata never becomes a proven module context',()=>{
  const result=packageContext({files:new Map([['src/nested/package.json',{text:'null'}]])},'src/nested/a.ts');
  assert.ok(result.reasons.length);
});
