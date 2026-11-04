import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMove } from './verify.mjs';
import { simpleMove } from './testing.fixture.mjs';

test('move reports have stable JSON identity and observations independent of tracked-file input order',()=>{
  const input=simpleMove();input.head.id='head';input.base.id='base';
  const first=verifyMove(input);
  input.head.files.reverse();input.base.files.reverse();
  assert.deepEqual(verifyMove(input),first);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),first);
  assert.equal(first.verification,'move');assert.equal(first.headId,'head');assert.equal(first.baseId,'base');
});
