import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {successorFixture,PRIVATE} from './pending-successor-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-pending-successor.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottracePendingSuccessorPreparation,'function','owning native pending-successor flow absent');return implementation.runFoottracePendingSuccessorPreparation;}
async function run(options={},extra={}){const f=await successorFixture(options),invocation=f.makeInvocation(),r=await entry()({...invocation,...extra});return {f,r,invocation};}
test('ONE native source/history executor creates exact successor objects without moving P or granting release',async()=>{
 const {f,r,invocation}=await run();assert.equal(r.status,'successor-prepared');assert.equal(r.record.complete,true);
 assert.equal(r.report.authorized,false);assert.equal(r.report.releaseReady,false);assert.equal(r.report.refMoved,false);
 assert.equal(r.report.nextPhaseAdmitted,false);assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);
 const commits=f.effects.filter(e=>e.path.endsWith('/git/commits'));assert.equal(commits.length,1);
 assert.deepEqual(commits[0].payload.parents,[f.M,f.P]);assert.equal(f.f.tip,f.P);
 assert.equal(f.calls.some(c=>c.method==='PATCH'),false);
 const ids=r.record.snapshot.commitLog.map(v=>v.stageId);
 assert.ok(ids.indexOf('proposal-bootstrap-result')<ids.indexOf('propose-inspection-report'));
 assert.equal(ids.filter(id=>id==='pending-successor-pre-effect').length,f.effects.length);
 assert.equal(ids.filter(id=>id==='pending-successor-apply').length,f.effects.length);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes(f.currentPrepared.notes),false);
});
test('retained source evidence without eligible native attempt history cannot submit even a blob',async()=>{
 const {f,r}=await run({retainedJobs:'prepare-only'});assert.equal(r.status,'technical-failure');assert.equal(r.record.complete,false);assert.equal(f.effects.length,0);
});
test('failed required pending checks prevent every object mutation',async()=>{
 const {f,r}=await run({checkFailure:true});assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
});
test('uncertain non-idempotent blob remains verify-only even when exact GET observes the created object',async()=>{
 const {f,r}=await run({effectStatus:503});assert.equal(r.status,'successor-verify-only');assert.equal(r.report.submission,'uncertain');
 assert.equal(f.effects.length,1);assert.equal(r.report.nextPhaseAdmitted,false);assert.equal(r.report.verified,true);assert.equal(f.f.tip,f.P);
});
test('uncertain object with unavailable GET stays technical and never retries another mutation',async()=>{
 const {f,r}=await run({effectStatus:503,effectApply:false});assert.equal(r.status,'technical-failure');assert.equal(r.record.complete,false);assert.equal(f.effects.length,1);
});
test('known wrong returned tree cannot be replaced by later healthy GET',async()=>{
 const {f,r}=await run({responseChange:(d,p)=>{if(p.endsWith('/git/trees'))d.sha='f'.repeat(40);}});
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.some(e=>e.path.endsWith('/git/commits')),false);
});
test('recheck current native source immediately before EACH object, preserving earlier acknowledged objects',async()=>{
 let dirty=false;const f=await successorFixture({effectChange:()=>{dirty=true;}}),invocation=f.makeInvocation(),clean=invocation.host.requireClean;
 invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw Error(PRIVATE);return clean();}};
 const r=await entry()(invocation);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,1);assert.equal(r.report.acknowledged,1);
});
for(const kind of ['stage','count'])test('every native pre-effect '+kind+' must belong to the actual latest iteration',async()=>{
 const snapshot=FlowChartExecutor.prototype.getSnapshot,count=FlowChartExecutor.prototype.getCommitCount;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const s=snapshot.call(this);
   if(s.commitLog.some(x=>x.stageId==='pending-successor-pre-effect')){touched=true;
    if(kind==='stage')return {...s,commitLog:s.commitLog.map(x=>x.stageId==='pending-successor-pre-effect'?{...x,stageId:'saved-claim'}:x)};}return s;};
  if(kind==='count')FlowChartExecutor.prototype.getCommitCount=function(){return count.call(this)+(touched?1:0);};
  const {f,r}=await run({}, {completed:true,executor:{},authorized:true});assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;FlowChartExecutor.prototype.getCommitCount=count;}
});

for(const kind of ['current-run','prepare-job','pending-ref','pending-parents','retained-history','refusal','reservation','required-checks','pending-signature'])test('ALL native predicates are reacquired after an earlier object: '+kind,async()=>{
 let armed=false,f;
 f=await successorFixture({
  effectChange:()=>{armed=true;},
  change:(data,path)=>{
   if(!armed)return;
   if(kind==='current-run'&&path.endsWith('/runs/500/attempts/1')){data.status='completed';data.conclusion='success';}
   if(kind==='prepare-job'&&path.includes('/runs/500/')&&data.jobs)data.jobs.find(j=>j.name==='prepare').conclusion='failure';
   if(kind==='pending-ref'&&path.endsWith('/git/ref/heads/release/next'))data.object.sha='f'.repeat(40);
   if(kind==='pending-parents'&&path.endsWith('/git/commits/'+f.P))data.parents.reverse();
   if(kind==='retained-history'&&path.includes('/runs/456/')&&data.jobs)data.jobs.find(j=>j.name==='proposal').conclusion='failure';
   if(kind==='reservation'&&path.includes('/assets?'))data.push({id:77777,name:'publish-attempt-'+f.currentPrepared.version+'.json',state:'uploaded',size:12});
  },
  checkChange:(data,path)=>{if(armed&&kind==='required-checks'&&path.includes('/runs/700/')&&data.jobs)data.jobs[0].conclusion='failure';},
  changeReview:(data,path)=>{if(armed&&kind==='refusal'&&path.includes('/reviews?'))data.push({id:201,state:'CHANGES_REQUESTED',commit_id:f.P,user:{id:42,type:'User',login:'reviewer42'}});},
  changeCommit:data=>{if(armed&&kind==='pending-signature')data.commit.verification.verified=false;}
 });
 const result=await entry()(f.makeInvocation());assert.equal(armed,true);assert.equal(result.status,'technical-failure');
 assert.equal(f.effects.length,1,'no second effect after '+kind+' drift');assert.equal(result.report.acknowledged,1);
});
for(const kind of ['previous-iteration','payload-digest','shared-state'])test('actual second pre-effect rejects '+kind+' substitution while preserving the first object',async()=>{
 const original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const snap=original.call(this),pre=snap.commitLog.filter(x=>x.stageId==='pending-successor-pre-effect');
   if(pre.length<2)return snap;touched=true;
   if(kind==='shared-state')return {...snap,sharedState:{...snap.sharedState,pendingSuccessorPreEffect:pre[0].overwrite.pendingSuccessorPreEffect}};
   const latest=pre.at(-1),bad=kind==='previous-iteration'?pre[0].overwrite.pendingSuccessorPreEffect:
    {...latest.overwrite.pendingSuccessorPreEffect,receiptRef:'f'.repeat(64)};
   return {...snap,commitLog:snap.commitLog.map(x=>x===latest?{...x,overwrite:{...x.overwrite,pendingSuccessorPreEffect:bad}}:x)};
  };
  const {f,r}=await run();assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,1);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});
for(const kind of ['tree','commit'])test('uncertain '+kind+' stops the SAME native flow without a later mutation or false acknowledgement',async()=>{
 const {f,r}=await run({effectStatus:path=>path.endsWith('/git/'+(kind==='tree'?'trees':'commits'))?503:201});
 assert.equal(r.status,'successor-verify-only');assert.equal(r.report.submission,'uncertain');
 assert.equal(r.report.attempted,r.report.acknowledged+1);
 assert.equal(r.report.verified,kind==='tree');assert.equal(r.report.nextPhaseAdmitted,false);
 assert.equal(f.effects.at(-1).path.endsWith('/git/'+(kind==='tree'?'trees':'commits')),true);
});
for(const status of [401,403,422,501])test('known object HTTP '+status+' stays technical with no later effect',async()=>{
 const {f,r}=await run({effectStatus:status,effectApply:false});assert.equal(r.status,'technical-failure');
 assert.equal(f.effects.length,1);assert.equal(r.report.acknowledged,0);assert.equal(r.report.submission,status===501?'failed':'rejected');
});
test('wrong resolved actor on the new successor commit prevents completion without a ref change',async()=>{
 const {f,r}=await run({responseChange:(data,path)=>{if(!path.includes('/git/')&&path.includes('/commits/'))data.committer.id++;}});
 assert.equal(r.status,'technical-failure');assert.equal(r.report.acknowledged,f.effects.length-1);assert.equal(f.f.tip,f.P);
});
test('the erased invocation environment cannot be recalled as a fresh non-idempotent attempt',async()=>{
 const f=await successorFixture({effectStatus:503}),invocation=f.makeInvocation(),first=await entry()(invocation),calls=f.effects.length;
 assert.equal(first.status,'successor-verify-only');assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);
 const second=await entry()(invocation);assert.equal(second.status,'technical-failure');assert.equal(f.effects.length,calls);
});
test('a finite exhausted bank retains acknowledged partial objects, never raises its bound or retries',async t=>{
 // Measure an actual effect boundary on the same provider recipe. Immutable
 // reuse may reduce request cost; a guessed historical ordinal is not a bound.
 let control,secondRequest=null;
 control=await successorFixture({effectChange:(_path,state)=>{if(state.effects.length===2)secondRequest=control.calls.length;}});
 const completed=await entry()(control.makeInvocation());assert.equal(completed.status,'successor-prepared');
 assert.ok(Number.isSafeInteger(secondRequest)&&secondRequest>1&&secondRequest<=4096);
 const requests=secondRequest-1;
 const f=await successorFixture(),r=await entry()({...f.makeInvocation(),limits:{requests,totalBytes:128*1024*1024}});
 assert.equal(r.status,'technical-failure');assert.equal(r.report.acknowledged,1);
 assert.equal(f.effects.length,1,'the second submission never reaches the provider');
 assert.equal(f.calls.length,requests,'fresh facets never reset or raise the SAME exhausted bank');assert.equal(f.f.tip,f.P);
 t.diagnostic('Measured second submission request '+secondRequest+'; bounded run stopped at '+requests+' with one acknowledged object.');
});

test('the FINAL awaited root source recheck catches dirt after native pending/signature/check observations',async()=>{
 const snapshot=FlowChartExecutor.prototype.getSnapshot;let armed=false,dirty=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const s=snapshot.call(this);if(s.commitLog.some(x=>x.stageId==='pending-successor-pre-effect'))armed=true;return s;};
  const f=await successorFixture({changeCommit:()=>{if(armed)dirty=true;}}),invocation=f.makeInvocation(),clean=invocation.host.requireClean;
  invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw Error(PRIVATE);return clean();}};
  const r=await entry()(invocation);assert.equal(armed,true);assert.equal(dirty,true);
  assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0,'mandatory final local/native source recheck before FIRST submission');
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;}
});
