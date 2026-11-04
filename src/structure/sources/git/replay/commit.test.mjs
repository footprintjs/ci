import assert from 'node:assert/strict';
import test from 'node:test';
import { commitInput } from './commit.mjs';
import { branches } from './testing.fixture.mjs';

test('raw commit headers bind the tree and ordered parents without revision-parent assumptions',t=>{
  const {path,git,input,left,right}=branches(t);
  const tree=git('rev-parse',`${right}^{tree}`);
  const head=input(['commit-tree',tree,'-p',left,'-p',right],'merge\n');
  assert.deepEqual(commitInput(path,head),{id:head,tree,parents:[left,right]});
  assert.equal(commitInput(path,right).parents.length,1);
  for(const bad of ['missing-ref','--help','HEAD\nother'])assert.throws(()=>commitInput(path,bad));
});
