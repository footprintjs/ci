import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeGit } from './process.mjs';
import { branches } from './testing.fixture.mjs';

const args=(left,right)=>['merge-tree','--write-tree','--name-only','--no-messages','-z',left,right];

test('real native Git clean conflict missing-ref and unrelated outcomes pin the raw NUL protocol',t=>{
  const clean=branches(t),conflict=branches(t,true);
  assert.match(nativeGit(clean.path,['--version']).stdout,/^git version \d+\.\d+/);
  const merged=nativeGit(clean.path,args(clean.left,clean.right));
  assert.equal(merged.exitCode,0);assert.match(merged.stdout,/^[a-f0-9]{40}\0$/);
  const conflicted=nativeGit(conflict.path,args(conflict.left,conflict.right));
  assert.equal(conflicted.exitCode,1);assert.match(conflicted.stdout,/^[a-f0-9]{40}\0file\.ts\0$/);
  const missing=nativeGit(clean.path,args('missing-ref',clean.right));
  assert.equal(missing.exitCode,1);assert.equal(missing.stdout,'');
  const unrelated=clean.input(['commit-tree',clean.git('rev-parse',`${clean.base}^{tree}`)],'unrelated\n');
  const refused=nativeGit(clean.path,args(clean.left,unrelated));
  assert.equal(refused.exitCode,128);assert.equal(refused.stdout,'');
});
