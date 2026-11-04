import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync,rmSync } from 'node:fs';
import { gitBytes } from './process.mjs';
import { transportFixture } from './transport.fixture.mjs';

test('shared Git reads block every transport despite candidate per-protocol allow configuration',t=>{
  const {repo,marker,args,control}=transportFixture(t);
  const positive=control();
  assert.notEqual(positive.status,0);assert.equal(existsSync(marker),true,'owned transport control did not run');
  rmSync(marker);
  assert.throws(()=>gitBytes(repo,args));
  assert.equal(existsSync(marker),false,'candidate-allowed transport crossed the data-only boundary');
});
