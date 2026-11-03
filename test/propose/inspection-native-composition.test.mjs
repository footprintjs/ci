import test from 'node:test';
import assert from 'node:assert/strict';
import {flowChart,FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import * as production from '../../src/propose/foottrace-inspection.mjs';
import * as shared from '../../src/propose/inspection-flow.mjs';
import {bootstrapFixture,PRIVATE} from './bootstrap-provider-fixture.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const options=f=>({transport:f.transport,context:f.fullContext,artifactId:800});
function factory(f,prefix){
 assert.equal(typeof production.createFoottraceProposeInspection,'function','production native inspection factory absent');
 assert.equal(typeof shared.createProposeInspection,'function','shared inspection recipe factory absent');
 return production.createFoottraceProposeInspection(options(f),prefix);
}
test('actual source prefix, native discovery/inspection and continuation use ONE owning executor',async()=>{
 const f=await bootstrapFixture();let after=null,executor;
 const prefix=flowChart('Owning source prefix',s=>{s.sourcePrefix={observed:true,authorized:false};},'owning-source-prefix');
 const stage=factory(f,prefix);assert.equal(stage.getBackend(),null);
 const chart=stage.chart.addFunction('Continue actual owning native prefix',scope=>{
  const snap=executor.getSnapshot(),log=snap.commitLog;
  assert.equal(executor.getCommitCount(),log.length);
  assert.equal(log.some(r=>r.stageId===stage.resultStageId),true);
  assert.equal(scope.proposeResult.outcome,'pass');after=stage.getBackend();
  scope.inputContinuation={available:after!==null,authorized:false};
 },'owning-input-continuation').build();
 executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));await executor.run();
 const snap=executor.getSnapshot(),ids=snap.commitLog.map(r=>r.stageId);
 for(const id of ['owning-source-prefix','propose-bootstrap-lineage','propose-bootstrap-result','propose-inspection-inputs','propose-inspection-report','owning-input-continuation'])
  assert.equal(ids.filter(x=>x===id).length,1,id);
 assert.ok(ids.indexOf('owning-source-prefix')<ids.indexOf('propose-bootstrap-lineage'));
 assert.ok(ids.indexOf(stage.resultStageId)<ids.indexOf('owning-input-continuation'));
 assert.equal(after.prepared.sourceSha,f.M);assert.equal(after.prepared.pendingSha,f.P);
 assert.equal(after.currentProposer.identity.runId,500);assert.equal(after.currentPreparation.reference.artifactId,800);
 assert.equal(after.retainedAttempts.eligible,false); // INPUT facts are not the full native effect eligibility.
 assert.equal(snap.sharedState.proposeResult.facts.authorized,false);
 assert.equal(JSON.stringify(snap).includes(PRIVATE),false);
});
test('native failed source prefix cannot run discovery or produce an inspection backend',async()=>{
 const f=await bootstrapFixture(),stage=factory(f,flowChart('Fail source prefix',()=>{throw new Error('source-prefix-unavailable');},'owning-source-failed'));
 const {record}=await runNativeObservationRecord({chart:stage.chart});
 assert.equal(record.complete,false);assert.equal(stage.getBackend(),null);assert.equal(f.calls.length,0);
});
test('completed or substituted current native producer remains HELD in a composed chart',async()=>{
 for(const change of [(v,p)=>{if(p.endsWith('/actions/runs/500')){v.status='completed';v.conclusion='success';}},
 (v,p)=>{if(p.endsWith('/actions/artifacts/800'))v.workflow_run.head_sha='f'.repeat(40);}]){
  const f=await bootstrapFixture({change}),stage=factory(f),{record,snapshot}=await runNativeObservationRecord({chart:stage.chart});
  assert.equal(record.complete,true);assert.equal(snapshot.sharedState.proposeResult.outcome,'hold');assert.equal(stage.getBackend(),null);
  assert.equal(JSON.stringify(record).includes(PRIVATE),false);
 }
});
test('public facade DATA start/executor/readers and saved input facts cannot select a predecessor or reader',async()=>{
 const f=await bootstrapFixture();let suppliedCalls=0;const fake=()=>{suppliedCalls++;throw new Error('PRIVATE-SUPPLIED-PORT');};
 const result=await production.runFoottraceProposeInspection({...options(f),context:{...f.fullContext,eventName:'pull_request'},
  start:{addFunction:fake},executor:{run:fake},readers:{readLineage:fake},inputBootstrap:{getBackend:fake},
  profile:{},proposeResult:{outcome:'pass',facts:{authorized:true}}});
 assert.equal(result.status,'held');assert.equal(result.backend,null);assert.equal(f.calls.length,0);assert.equal(suppliedCalls,0);
});
test('one production factory invocation cannot reuse stale backend through another executor',async()=>{
 const f=await bootstrapFixture(),stage=factory(f),first=await runNativeObservationRecord({chart:stage.chart});
 assert.equal(first.record.complete,true);assert.notEqual(stage.getBackend(),null);const before=f.calls.length;
 const second=await runNativeObservationRecord({chart:stage.chart});
 assert.equal(second.record.complete,false);assert.equal(stage.getBackend(),null);assert.equal(f.calls.length,before);
});
test('source bootstrap cannot be replaced by DATA saved facts in a composed native recipe',async()=>{
 const f=await bootstrapFixture(),stage=factory(f),chart=stage.chart.build();
 const executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true,proposeBootstrapResult:{available:true},
  proposeResult:{outcome:'pass'},proposeInspectionFacts:{authorized:true}},commitValues:'delta'});
 await executor.run();
 assert.equal(stage.getBackend().prepared.sourceSha,f.M);assert.ok(f.calls.length>0);
 assert.equal(executor.getSnapshot().sharedState.proposeResult.facts.authorized,false);
});

test('full production reobservation reacquires native inputs and all shared bindings without another executor',async()=>{
 const f=await bootstrapFixture({retainedJobs:'full-native'}),stage=factory(f);
 assert.equal(typeof stage.reobserve,'function','native reobservation absent');
 assert.equal(await stage.reobserve(),false);assert.equal(f.calls.length,0);
 const {record}=await runNativeObservationRecord({chart:stage.chart});assert.equal(record.complete,true);
 assert.equal(stage.getBackend().retainedAttempts.eligible,true);const before=f.calls.length;
 assert.equal(await stage.reobserve(),true);assert.ok(f.calls.length>before);
 const calls=f.calls.slice(before);
 for(const tail of ['/git/ref/heads/main','/git/ref/heads/release/next','/pulls/101/reviews',
  '/actions/runs/500','/actions/artifacts/800/zip'])
  assert.ok(calls.some(p=>new URL('https://offline.invalid'+p).pathname.endsWith(tail)),tail);
 assert.equal(stage.getBackend().prepared.sourceSha,f.M);assert.equal(JSON.stringify(record).includes(PRIVATE),false);
});
for(const [name,mutate] of [
 ['main ref',(d,p)=>{if(p.endsWith('/git/ref/heads/main'))d.object.sha='e'.repeat(40);}],
 ['pending ref',(d,p)=>{if(p.endsWith('/git/ref/heads/release/next'))d.object.sha='e'.repeat(40);}],
 ['pending ordered parents',(d,p,f)=>{if(p.endsWith('/git/commits/'+f.P))d.parents.reverse();}],
 ['current running producer',(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}],
 ['current prepare job',(d,p)=>{if(p.includes('/runs/500/')&&p.includes('/jobs'))d.jobs.find(j=>j.name==='prepare').conclusion='failure';}],
 ['current archive',(d,p)=>{if(p.endsWith('/actions/artifacts/800'))d.workflow_run.head_sha='e'.repeat(40);}],
 ['immutable package blob',(d,p)=>{if(p.includes('/contents/package.json?ref='))d.sha='e'.repeat(40);}],
 ['new valid review observation',(d,p,f)=>{if(new URL('https://offline.invalid'+p).pathname.endsWith('/pulls/101/reviews'))
  d.push({id:101,state:'COMMENTED',commit_id:f.P,user:{id:500,type:'Bot'}});}],
 ['retained uncertain proposal',(d,p)=>{if(p.includes('/runs/456/')&&p.includes('/jobs'))d.jobs.find(j=>j.name==='proposal').conclusion='failure';}]
])test('later '+name+' drift permanently discards composed INPUT backend',async()=>{
 let later=false,f;f=await bootstrapFixture({retainedJobs:'full-native',change:(d,p)=>{if(later)mutate(d,p,f);}});
 const stage=factory(f);assert.equal(typeof stage.reobserve,'function','native reobservation absent');
 const {record}=await runNativeObservationRecord({chart:stage.chart});assert.equal(record.complete,true);
 assert.equal(stage.getBackend().retainedAttempts.eligible,true);later=true;
 assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);const stopped=f.calls.length;later=false;
 assert.equal(await stage.reobserve(),false);assert.equal(f.calls.length,stopped);assert.equal(stage.getBackend(),null);
});

test('concurrent execution of ONE factory permanently invalidates the first pending native prefix',async()=>{
 let block=true,enter,release;const entered=new Promise(r=>{enter=r;}),pending=new Promise(r=>{release=r;});
 const f=await bootstrapFixture({changeHttp:(reply)=>{if(block){block=false;enter();return pending.then(()=>reply);}}}),stage=factory(f);
 const first=runNativeObservationRecord({chart:stage.chart});let second;
 try{await Promise.race([entered,first.then(()=>assert.fail('native execution settled before acquisition barrier'))]);second=await runNativeObservationRecord({chart:stage.chart});assert.equal(second.record.complete,false);}
 finally{release();}
 const settled=await first;assert.equal(settled.record.complete,false);assert.equal(stage.getBackend(),null);
});
test('concurrent reobservation cannot resurrect backend after a sibling invalidation',async()=>{
 let block=false,enter,release;const entered=new Promise(r=>{enter=r;}),pending=new Promise(r=>{release=r;});
 const f=await bootstrapFixture({retainedJobs:'full-native',changeHttp:reply=>{
  if(block){block=false;enter();return pending.then(()=>reply);}
 }}),stage=factory(f);
 assert.equal((await runNativeObservationRecord({chart:stage.chart})).record.complete,true);
 assert.notEqual(stage.getBackend(),null);block=true;const first=stage.reobserve();
 try{await Promise.race([entered,first.then(()=>assert.fail('native reobservation settled before acquisition barrier'))]);assert.equal(await stage.reobserve(),false);}finally{release();}
 assert.equal(await first,false);assert.equal(stage.getBackend(),null);assert.equal(await stage.reobserve(),false);
});

test('the shared recipe itself refuses a repeated held invocation without a bootstrap wrapper',async()=>{
 assert.equal(typeof shared.createProposeInspection,'function');const stage=shared.createProposeInspection({});
 const first=await runNativeObservationRecord({chart:stage.chart});assert.equal(first.record.complete,true);
 assert.equal(first.snapshot.sharedState.proposeResult.outcome,'hold');assert.equal(stage.getBackend(),null);
 const second=await runNativeObservationRecord({chart:stage.chart});assert.equal(second.record.complete,false);
 assert.equal(stage.getBackend(),null);
});
