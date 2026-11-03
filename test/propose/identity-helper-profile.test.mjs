import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoottraceProposalBootstrapInspection} from '../../src/propose/proposal-bootstrap.mjs';
import {proposalBootstrapFixture} from './proposal-bootstrap-provider-fixture.mjs';
async function run(f){return runFoottraceProposalBootstrapInspection(f.makeInvocation());}
test('credential-free facts require explicit v2 profile and all four source files including the identity helper',async()=>{
 const f=await proposalBootstrapFixture(),r=await run(f);assert.equal(r.status,'proposal-bootstrap-only');
 assert.match(r.backend.sourceBinding.reference.identityHelperBlob,/^[a-f0-9]{40}$/);
 assert.equal(r.report.authorized,false);
});
test('legacy three-file profile cannot supply identity-helper source authority even with matching facts',async()=>{
 const f=await proposalBootstrapFixture({
  changeProfile:p=>{p.id='foottrace-proposal-host-v1';delete p.identityHelper;},
  changeSource:s=>{delete s.files.identityHelper;}
 }),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
});
for(const kind of ['bytes','missing','path','mode','hash'])test('identity-helper '+kind+' substitution is held before any private source authority',async()=>{
 const f=await proposalBootstrapFixture({
  changeSource:s=>{if(kind==='bytes')s.files.identityHelper=Buffer.from('tampered helper');if(kind==='missing')delete s.files.identityHelper;},
  changeProfile:p=>{
   if(kind==='path'&&p.identityHelper)p.identityHelper.path='scripts/other.cjs';
   if(kind==='mode'&&p.identityHelper)p.identityHelper.mode='100755';
   if(kind==='hash'&&p.identityHelper)p.identityHelper.sha256='f'.repeat(64);
  }
 }),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
});
