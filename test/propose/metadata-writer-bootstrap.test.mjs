import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
import {foottraceTransportPort,foottraceMetadataPatchPort} from '../../src/propose/foottrace-transport.mjs';
import * as bootstrap from '../../src/propose/proposal-bootstrap-flow.mjs';
function writer(options){
 assert.equal(typeof bootstrap.createFoottraceMetadataWriterBootstrap,'function','shared CODE-selected writer bootstrap is missing');
 return bootstrap.createFoottraceMetadataWriterBootstrap(options);
}
async function run(f,extra={}){
 const invocation=f.makeInvocation();let stage;assert.doesNotThrow(()=>{stage=writer({...invocation,...extra});});
 const r=await runNativeObservationRecord({chart:stage.chart});
 return {invocation,stage,...r,backend:stage.getBackend()};
}
test('same native bootstrap core observes current source/run with a separate captured writer owner and start identity only',async()=>{
 const f=await proposalBootstrapFixture(),r=await run(f);assert.equal(r.record.complete,true);assert.ok(r.backend);
 assert.equal(r.backend.transport.scope,'captured-native-http-owner');
 assert.equal(r.backend.sourceBinding.reference.sourceTree,f.current.commit.tree.sha);
 assert.equal(foottraceTransportPort(r.backend.transport).inspectionReadOnly,false);
 assert.equal(r.backend.current.identity.runId,500);
 assert.equal(r.backend.current.appIdentityObservation,'cached-key-holder-facts');
 assert.equal(r.backend.current.privateAppIdentityAdmitted,false);assert.equal(r.backend.current.writerCredentialBindingAdmitted,false);
 assert.equal(r.backend.current.authorized,false);assert.equal(r.record.snapshot.sharedState.proposalBootstrapResult.writerCredentialBindingAdmitted,false);
 assert.equal(r.record.snapshot.sharedState.proposalBootstrapResult.executedWrites,0);assert.equal(r.record.snapshot.sharedState.proposalBootstrapResult.authorized,false);
 assert.equal(f.calls.some(route=>route==='/app'||route.startsWith('/app/')||route.startsWith('/apps/')),false);
 assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
});
test('writer token and cached identity are sanitized before first host IO and provider await',async()=>{
 const f=await proposalBootstrapFixture(),i=f.makeInvocation(),clean=i.host.requireClean,fetcher=i.fetcher;let hostReads=0,httpReads=0;
 const sanitized=()=>{for(const k of ['GH_TOKEN','APP_IDENTITY_FACTS','APP_PRIVATE_KEY','APP_JWT'])assert.equal(Object.hasOwn(i.env,k),false);};
 const stage=writer({...i,host:{...i.host,requireClean:()=>{hostReads++;sanitized();return clean();}},
  fetcher:async(...args)=>{httpReads++;sanitized();return fetcher(...args);}});
 const r=await runNativeObservationRecord({chart:stage.chart});assert.equal(r.record.complete,true);assert.ok(stage.getBackend());
 assert.ok(hostReads>0);assert.ok(httpReads>0);
});
test('DATA cannot select a capture constructor or promote the existing inspection prefix',async()=>{
 const f=await proposalBootstrapFixture();let selections=0;
 const options={...f.makeInvocation(),captureInvocation:()=>{selections++;throw Error(PRIVATE);},createTransport:()=>{selections++;throw Error(PRIVATE);},inspectionReadOnly:true};
 const stage=writer(options);await runNativeObservationRecord({chart:stage.chart});assert.ok(stage.getBackend());assert.equal(stage.getBackend().transport.scope,'captured-native-http-owner');assert.equal(selections,0);
 const read=bootstrap.createFoottraceProposalBootstrapInspection({...f.makeInvocation(),captureInvocation:bootstrap.createFoottraceMetadataWriterBootstrap,inspectionReadOnly:false});
 await runNativeObservationRecord({chart:read.chart});assert.ok(read.getBackend());assert.equal(read.getBackend().transport.scope,'captured-native-read-owner');
 assert.throws(()=>foottraceMetadataPatchPort(read.getBackend().transport,{pullNumber:101,desired:{title:'Exact',body:'Notes'}}));
});
for(const key of ['APP_PRIVATE_KEY','APP_JWT'])test('existing-six-holder writer prefix rejects '+key+' and performs zero acquisitions',async()=>{
 const f=await proposalBootstrapFixture({changeEnv:env=>{env[key]=PRIVATE;}}),r=await run(f);
 assert.equal(r.backend,null);assert.equal(f.calls.length,0);
 for(const k of ['GH_TOKEN','APP_IDENTITY_FACTS','APP_PRIVATE_KEY','APP_JWT'])assert.equal(Object.hasOwn(r.invocation.env,k),false);
});
for(const mode of ['completed-producer','no-push','changed-job-start-identity'])test('writer prefix retains '+mode+' refusal and never invents a fresh identity grant',async()=>{
 const f=await proposalBootstrapFixture({change:(v,route)=>{
  if(mode==='completed-producer'&&route.endsWith('/actions/runs/500')){v.status='completed';v.conclusion='success';}
  if(mode==='no-push'&&route==='/repos/footprintjs/foottrace')v.permissions.push=false;
 },changeEnv:env=>{if(mode==='changed-job-start-identity'){const facts=JSON.parse(env.APP_IDENTITY_FACTS);facts.runAttempt=2;env.APP_IDENTITY_FACTS=JSON.stringify(facts);}}});
 const r=await run(f);assert.equal(r.backend,null);assert.equal(r.record.snapshot.sharedState.proposalBootstrapResult.authorized,false);
});
test('source drift remains a refusal even though this prefix owns the writer client',async()=>{
 const f=await proposalBootstrapFixture({dirty:true}),r=await run(f);assert.equal(r.backend,null);assert.equal(r.stage.getInvocationInput().transport.scope,'captured-native-http-owner');
 assert.equal(r.record.snapshot.sharedState.proposalBootstrapResult.source,false);
});
test('the prefix owns one native invocation and a native result stage, never a permission flag',async()=>{
 const f=await proposalBootstrapFixture(),r=await run(f);assert.ok(r.backend);
 assert(r.record.snapshot.commitLog.some(row=>row.stageId===r.stage.resultStageId));
 const next=await runNativeObservationRecord({chart:r.stage.chart});assert.equal(next.record.complete,false);assert.equal(r.stage.getBackend(),null);
});
