import test from 'node:test';
import assert from 'node:assert/strict';
import * as invocation from '../../src/propose/proposal-invocation.mjs';
import {foottraceTransportPort,foottraceMetadataPatchPort} from '../../src/propose/foottrace-transport.mjs';
import {createFoottraceCurrentInputReader} from '../../src/propose/foottrace-current-inputs.mjs';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
function capture(options){
 assert.equal(typeof invocation.captureFoottraceMetadataWriterInvocation,'function','distinct trusted CODE writer invocation capture is missing');
 return invocation.captureFoottraceMetadataWriterInvocation(options);
}
async function current(c){
 const p=await createFoottraceCurrentInputReader(c)();assert.equal(p.valid,true);
 return createFoottraceProposerReader(c)(p.prepared);
}
test('writer capture binds one real-shaped running native identity but no writer permission or grant',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),i=f.makeInvocation(),c=capture(i);
 assert.equal(c.transport.scope,'captured-native-http-owner');assert.equal(f.calls.length,0);
 for(const key of ['GH_TOKEN','APP_JWT','APP_PRIVATE_KEY'])assert.equal(Object.hasOwn(i.env,key),false);
 const value=await current(c);assert.equal(value.valid,true);assert.equal(value.identity.runId,500);
 assert.equal(value.privateAppIdentityAdmitted,true);assert.equal(value.writerCredentialBindingAdmitted,false);
 assert.equal(value.retainedEligibilityAdmitted,false);assert.equal(value.authorized,false);
 assert.equal(JSON.stringify(value).includes(PRIVATE),false);
});
test('read-only public capture stays unable to derive the exact PATCH facet',async()=>{
 const f=await proposalBootstrapFixture(),c=invocation.captureFoottraceProposalInvocation(f.makeInvocation());
 assert.equal(c.transport.scope,'captured-native-read-owner');
 assert.throws(()=>foottraceMetadataPatchPort(c.transport,{pullNumber:101,desired:{title:'Exact',body:'Notes'}}));
});
test('only trusted CODE entry chooses writer capture; DATA transport and callbacks cannot choose a client',async()=>{
 const f=await proposalBootstrapFixture(),i=f.makeInvocation();let calls=0;
 const hook={get scope(){calls++;throw new Error(PRIVATE);}};
 let c;assert.doesNotThrow(()=>{c=capture({...i,transport:hook,createTransport:()=>{calls++;throw new Error(PRIVATE);},inspectionReadOnly:true});});
 assert.equal(calls,0);assert.equal(c.transport.scope,'captured-native-http-owner');assert.equal(f.calls.length,0);
 const value=await current(c);assert.equal(value.valid,true);assert.equal(calls,0);
});
for(const [key,value] of [
 ['GITHUB_SHA','f'.repeat(40)],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_JOB','release-pr'],
 ['GITHUB_WORKFLOW_REF','footprintjs/foottrace/.github/workflows/other.yml@refs/heads/main'],
 ['APP_PRIVATE_KEY',PRIVATE]
])test('writer capture refuses '+key+' substitution before provider acquisition and sanitizes',async()=>{
 const f=await proposalBootstrapFixture(),i=f.makeInvocation();i.env[key]=value;
 assert.throws(()=>capture(i));assert.equal(f.calls.length,0);
 for(const k of ['GH_TOKEN','APP_JWT','APP_PRIVATE_KEY'])assert.equal(Object.hasOwn(i.env,k),false);
});
test('captured writer client cannot be replaced by later mutable environment credentials',async()=>{
 const f=await proposalBootstrapFixture(),i=f.makeInvocation(),c=capture(i);
 Object.assign(i.env,{GH_TOKEN:PRIVATE,APP_JWT:PRIVATE,APP_CLIENT_ID:'different',SOURCE_SHA:'f'.repeat(40)});
 const value=await current(c);assert.equal(value.valid,true);assert.equal(value.authorized,false);
 const port=foottraceTransportPort(c.transport);assert.equal(port.inspectionReadOnly,false);
 assert.equal(JSON.stringify(value).includes(PRIVATE),false);
});
for(const mode of ['completed-producer','push-false'])test('writer capture retains native '+mode+' refusal',async()=>{
 const f=await proposalBootstrapFixture({change:(d,p)=>{
  if(mode==='completed-producer'&&p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}
  if(mode==='push-false'&&p==='/repos/footprintjs/foottrace')d.permissions.push=false;
 }}),c=capture(f.makeInvocation()),value=await current(c);
 assert.equal(value.valid,false);assert.equal(value.authorized,false);
 assert.equal(JSON.stringify(value).includes(PRIVATE),false);
});
