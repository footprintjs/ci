import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-metadata-reconciliation.mjs').catch(()=>({}));
function ensure(){assert.equal(typeof implementation.runFoottraceMetadataReconciliation,'function','the SAME-writer native C1 controller is missing');return implementation.runFoottraceMetadataReconciliation;}
async function run(options={},extra={}){
 const f=await metadataC1Fixture(options),invocation=f.makeInvocation(),r=await ensure()({...invocation,...extra});
 return {f,r,invocation};
}
test('exact current metadata completes the actual native C1 no-op with zero mutations and no release grant',async()=>{
 const {f,r,invocation}=await run({exact:true});assert.equal(r.status,'metadata-match');assert.equal(f.patches.length,0);
 assert.equal(r.report.patchAttempts,0);assert.equal(r.report.releaseReady,false);assert.equal(r.report.authorized,false);
 assert.equal(r.record.complete,true);assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('stale metadata uses ONE exact native policy PATCH after a real committed pre-effect boundary',async()=>{
 const {f,r}=await run();assert.equal(r.status,'metadata-match');assert.equal(f.patches.length,1);
 assert.equal(r.report.patchAttempts,1);assert.equal(r.report.submission,'returned');
 const ids=r.record.snapshot.commitLog.map(x=>x.stageId);
 assert.ok(ids.indexOf('metadata-c1-pre-effect')>=0);
 assert.ok(ids.indexOf('metadata-c1-apply')>ids.indexOf('metadata-c1-pre-effect'));
 assert.ok(ids.indexOf('metadata-c1-terminal')>ids.indexOf('metadata-c1-apply'));
 assert.equal(JSON.stringify(r).includes(f.patches[0].body),false);
 assert.equal(f.calls.some(x=>x.method!=='GET'&&x.method!=='PATCH'),false);
});
test('uncertain exact PATCH then exact GET reconciles without retry',async()=>{
 const {f,r}=await run({status:503});assert.equal(r.status,'metadata-match');assert.equal(r.report.submission,'uncertain');
 assert.equal(f.patches.length,1);
});
test('uncertain PATCH then verified stale GET holds only this invocation with no second PATCH',async()=>{
 const {f,r}=await run({status:503,apply:false});assert.equal(r.status,'metadata-hold');assert.equal(r.report.submission,'uncertain');
 assert.equal(r.report.proposeOutcome,'hold-metadata-stale');assert.equal(f.patches.length,1);assert.equal(r.record.complete,true);
});
test('a later invocation with ALL fresh native predicates may ONE identical PATCH without saved authority',async()=>{
 const f=await metadataC1Fixture({status:503,apply:false}),entry=ensure();
 const first=await entry(f.makeInvocation()),second=await entry(f.makeInvocation());
 assert.equal(first.status,'metadata-hold');assert.equal(second.status,'metadata-hold');
 assert.equal(f.patches.length,2);assert.deepEqual(f.patches[0],f.patches[1]);
 assert.ok(f.calls.filter(x=>x.path.endsWith('/runs/500/attempts/1')).length>2);
});
for(const status of [401,403,422,501])test('native PATCH '+status+' remains technical failure, never successful metadata HOLD',async()=>{
 const {f,r}=await run({status,apply:false});assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,1);
 assert.equal(r.record.complete,false);assert.notEqual(r.report.proposeOutcome,'hold-metadata-stale');
 assert.equal(r.report.submission,status===501?'failed':'rejected','retain the actual finite attempted endpoint state on technical failure');
});
test('HTTP200 parse failure stays technical even if later GET could have matched',async()=>{
 const {f,r}=await run({invalidJSON:true});assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,1);
});
for(const field of ['head','metadata','repository','actor','merged-at'])test('known inconsistent returned '+field+' is not erased by a later healthy GET',async()=>{
 const {f,r}=await run({responseChange:d=>{if(field==='head')d.head.sha='f'.repeat(40);else if(field==='repository')d.head.repo.full_name='foreign/repository';else if(field==='actor')d.user.id=999999;else if(field==='merged-at')d.merged_at='2026-11-03T18:00:00Z';else d.body='inconsistent';}});
 assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,1);
});
test('failed required CI never falls back to C1 readiness',async()=>{
 const {f,r}=await run({checkFailure:true});assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
});
test('post-submission GET acquisition failure remains technical with a finite retained partial outcome',async()=>{
 const {f,r}=await run({readChange:(p,{patches})=>{if(patches.length)throw Error(PRIVATE);}});
 assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,1);assert.equal(r.report.patchAttempts,1);
 assert.equal(r.record.complete,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 assert.ok(r.record.snapshot?.commitLog.some(x=>x.stageId==='metadata-c1-pre-effect'));
});
for(const kind of ['stage','count'])test('actual owning native pre-effect '+kind+' cannot be replaced by a claimed DATA fact',async()=>{
 const original=FlowChartExecutor.prototype.getSnapshot,count=FlowChartExecutor.prototype.getCommitCount;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const value=original.call(this);
   if(value.commitLog.some(x=>x.stageId==='metadata-c1-pre-effect')){
    touched=true;if(kind==='stage')return {...value,commitLog:value.commitLog.map(x=>x.stageId==='metadata-c1-pre-effect'?{...x,stageId:'uncommitted-claim'}:x)};
   }return value;
  };
  if(kind==='count')FlowChartExecutor.prototype.getCommitCount=function(){return count.call(this)+(touched?1:0);};
  const {f,r}=await run({}, {completed:true,preEffectCommitted:true,authorized:true});
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;FlowChartExecutor.prototype.getCommitCount=count;}
});
test('source dirtied after actual pre-effect commit refuses before any PATCH',async()=>{
 const original=FlowChartExecutor.prototype.getSnapshot;let armed=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const v=original.call(this);if(v.commitLog.some(x=>x.stageId==='metadata-c1-pre-effect'))armed=true;return v;};
  const f=await metadataC1Fixture(),invocation=f.makeInvocation(),clean=invocation.host.requireClean;
  invocation.host={...invocation.host,requireClean:()=>{if(armed)throw Error(PRIVATE);return clean();}};
  const r=await ensure()(invocation);assert.equal(armed,true);assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});

for(const kind of ['required-checks','retained-history','current-run','signed-state','refusal','reservation'])test('ALL repository predicates are reacquired after the real pre-effect commit: '+kind,async()=>{
 const snapshot=FlowChartExecutor.prototype.getSnapshot;let armed=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const v=snapshot.call(this);if(v.commitLog.some(x=>x.stageId==='metadata-c1-pre-effect'))armed=true;return v;};
  let f;f=await metadataC1Fixture({
   checkChange:(data,p)=>{if(armed&&kind==='required-checks'&&p.includes('/runs/700/')&&data.jobs)data.jobs[0].conclusion='failure';},
   change:(data,p)=>{
    if(!armed)return;
    if(kind==='retained-history'&&p.includes('/runs/456/')&&data.jobs)data.jobs.find(x=>x.name==='plan').conclusion='neutral';
    if(kind==='current-run'&&p.endsWith('/runs/500/attempts/1')){data.status='completed';data.conclusion='success';}
    if(kind==='reservation'&&p.includes('/assets?'))data.push({id:7654321,name:'publish-attempt-'+f.currentPrepared.version+'.json',state:'uploaded',size:12});
   },
   changeCommit:data=>{if(armed&&kind==='signed-state')data.commit.verification.verified=false;},
   changeReview:(data,p)=>{if(armed&&kind==='refusal'&&p.includes('/reviews?'))data.push({id:201,state:'CHANGES_REQUESTED',commit_id:f.head,user:{id:42,type:'User',login:'reviewer42'}});}
  });
  const r=await ensure()(f.makeInvocation());assert.equal(armed,true);assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;}
});
test('recognized network uncertainty is GET-verified without retry in the actual owning flow',async()=>{
 const {f,r}=await run({responseChange:()=>{throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});}});
 assert.equal(r.status,'metadata-match');assert.equal(r.report.submission,'uncertain');assert.equal(f.patches.length,1);
});

test('invalid source aliases never claim start-of-job App facts were bound by the native prefix',async()=>{
 const {f,r}=await run({changeEnv:env=>{env.GITHUB_SHA='f'.repeat(40);}});
 assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);assert.equal(r.report.appIdentityObservation,'unavailable');
});
