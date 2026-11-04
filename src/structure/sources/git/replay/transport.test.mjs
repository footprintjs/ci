import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync,rmSync } from 'node:fs';
import { nativeGit } from './process.mjs';
import { transportFixture } from '../transport.fixture.mjs';

test('native replay blocks transport before an explicitly allowed external helper can execute',t=>{
  const {repo,marker,args,control}=transportFixture(t);
  const positive=control();
  assert.notEqual(positive.status,0);assert.equal(existsSync(marker),true);
  rmSync(marker);
  const result=nativeGit(repo,args);
  assert.notEqual(result.exitCode,0);
  assert.equal(existsSync(marker),false,'per-protocol configuration bypassed the no-transport policy');
});
