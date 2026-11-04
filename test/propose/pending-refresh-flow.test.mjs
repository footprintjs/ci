import {FlowChartExecutor} from 'footprintjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshFixture,PRIVATE} from './pending-refresh-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-pending-successor.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottracePendingRefresh,'function','native full ref-then-metadata entry absent');return implementation.runFoottracePendingRefresh;}
test('ONE owning native flow prepares exact objects, nonforce moves P to N, and reconciles the SAME PR metadata',async()=>{
 const f=await refreshFixture(),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'metadata-reconciled');assert.equal(result.record.complete,true);
 assert.equal(f.refMoves.length,1);assert.equal(f.refMoves[0].force,false);assert.equal(f.patches.length,1);
 assert.equal(result.report.refMoved,true);assert.equal(result.report.releaseReady,false);assert.equal(result.report.authorized,false);
 assert.equal(result.report.refOutcome,'acknowledged');assert.equal(result.report.metadataLabel,'metadata reconciled for N');
 assert.equal(result.report.ciForMetadataRequired,false);assert.equal(result.report.mergeReleaseGatesStillRequired,true);
 assert.equal(JSON.stringify(result).includes(PRIVATE),false);
 const paths=f.refreshCalls,move=paths.findIndex(v=>v.method==='PATCH'&&v.path.includes('/git/refs/'));
 assert.ok(move>=0);assert.equal(paths.slice(move+1).some(v=>v.path.includes('/actions/workflows/ci.yml')||v.path.includes('/actions/workflows/codeql.yml')),false);
 const ids=result.record.snapshot.commitLog.map(r=>r.stageId);
 assert.ok(ids.indexOf('pending-refresh-ref-pre-effect')<ids.indexOf('pending-refresh-ref-apply'));
 assert.ok(ids.indexOf('pending-refresh-metadata-pre-effect')<ids.indexOf('pending-refresh-metadata-apply'));
});
test('already exact metadata after ACKed ref gets no metadata PATCH, while the ref is still a fresh nonforce effect',async()=>{
 const f=await refreshFixture({exact:true}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'metadata-reconciled');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(result.report.metadataPatchAttempts,0);
});
test('uncertain ref with exact GET never enters metadata or repeats the ref',async()=>{
 const f=await refreshFixture({refStatus:503}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'refresh-verify-only');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(result.report.refOutcome,'uncertain');assert.equal(result.report.nextPhaseAdmitted,false);
});
test('uncertain exact setter after known ref gets GET-only metadata verification',async()=>{
 const f=await refreshFixture({metadataStatus:503}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'metadata-reconciled');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);
 assert.equal(result.report.metadataSubmission,'uncertain');assert.equal(result.report.mergeReleaseGatesStillRequired,true);
});
test('uncertain stale setter after known ref HOLDS THIS invocation with no ref rollback or PATCH retry',async()=>{
 const f=await refreshFixture({metadataStatus:503,metadataApply:false}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'metadata-hold');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);
 assert.equal(f.f.tip,f.refMoves[0].sha);assert.equal(result.report.metadataSubmission,'uncertain');
});

test('known inconsistent ref reply preserves the RETURNED attempted outcome and unknown movement, never inferred absence',async()=>{
 const f=await refreshFixture({refReplyChange:data=>{data.object.sha='f'.repeat(40);}}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'technical-failure');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(result.report.refOutcome,'returned');assert.equal(result.report.refMoved,null);
 assert.equal(f.f.tip,f.refMoves[0].sha);
});
test('uncertain ref observing desired N still reports movement attribution UNKNOWN and never metadata',async()=>{
 const f=await refreshFixture({refStatus:503}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'refresh-verify-only');assert.equal(result.report.refMoved,null);assert.equal(f.patches.length,0);
});
test('verified stale metadata is labelled stale for N, never reconciled or N verified',async()=>{
 const f=await refreshFixture({metadataStatus:503,metadataApply:false}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'metadata-hold');assert.equal(result.report.metadataLabel,'metadata stale for N');
 assert.equal(Object.hasOwn(result.report,'verified'),false);assert.equal(result.report.objectsVerified,true);
});

for(const [stage,kinds] of [
 ['pending-refresh-ref-pre-effect',['current-run','writer','refusal','reservation','required-checks','historical-date']],
 ['pending-refresh-metadata-pre-effect',['current-run','writer','refusal','prior-approval','reservation','main-ref','new-ref','new-parents','new-signature','current-archive','current-source-inventory','multiple-pr']]
])for(const kind of kinds)test('ALL fresh '+stage+' predicates refuse '+kind+' before that mutation',async()=>{
 const original=FlowChartExecutor.prototype.getSnapshot;let armed=false,f;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const s=original.call(this);if(s.commitLog.some(x=>x.stageId===stage))armed=true;return s;};
  f=await refreshFixture({
   change:(data,path)=>{
    if(!armed)return;const url=new URL('https://offline.invalid'+path),p=url.pathname;
    if(kind==='current-run'&&p.endsWith('/actions/runs/500')){data.status='completed';data.conclusion='success';}
    if(kind==='writer'&&p==='/repos/footprintjs/foottrace')data.permissions.push=false;
    if(kind==='main-ref'&&p.endsWith('/git/ref/heads/main'))data.object.sha='f'.repeat(40);
    if(kind==='new-ref'&&p.endsWith('/git/ref/heads/release/next'))data.object.sha='f'.repeat(40);
    if(kind==='new-parents'&&p.endsWith('/git/commits/'+f.f.tip))data.parents=[{sha:f.P},{sha:f.M}];
    if(kind==='historical-date'&&p.endsWith('/git/commits/'+f.B))data.committer.date='2026-11-02T00:00:00Z';
    if(kind==='current-archive'&&p.endsWith('/actions/artifacts/800'))data.workflow_run.head_sha='f'.repeat(40);
    if(kind==='current-source-inventory'&&p.includes('/git/trees/')){data.tree.find(x=>x.type==='blob').sha='f'.repeat(40);}
    if(kind==='reservation'&&path.includes('/assets?'))data.push({id:987654,name:'publish-attempt-'+f.currentPrepared.version+'.json',state:'uploaded',size:12});
    if(kind==='multiple-pr'&&p.endsWith('/pulls')&&url.searchParams.get('state')==='all'){
     const row=data.find(x=>x.state==='open');data.push({...structuredClone(row),id:row.id+100,number:row.number+100});
    }
   },
   changeReview:(data,path)=>{if(armed&&['refusal','prior-approval'].includes(kind)&&path.includes('/reviews?'))data.push({
    id:4567,state:kind==='refusal'?'CHANGES_REQUESTED':'APPROVED',commit_id:kind==='prior-approval'?f.P:f.f.tip,
    user:{id:42,type:'User',login:'reviewer42'}});},
   checkChange:(data,path)=>{if(armed&&kind==='required-checks'&&path.includes('/runs/700/')&&data.jobs)data.jobs[0].conclusion='failure';},
   responseChange:(data,path)=>{if(armed&&kind==='new-signature'&&!path.includes('/git/')&&path.includes('/commits/'))data.commit.verification.verified=false;}
  });
  const result=await entry()(f.makeInvocation());assert.equal(armed,true);assert.equal(result.status,'technical-failure');
  assert.equal(f.refMoves.length,stage.includes('metadata')?1:0);assert.equal(f.patches.length,0);
  assert.equal(result.report.acknowledged,5,'earlier returned object outcomes retained');
  assert.equal(result.report.releaseReady,false);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});
for(const phase of ['ref','metadata'])for(const kind of ['stage','count','digest'])test(phase+' actual pre-effect '+kind+' cannot be supplied or substituted by DATA',async()=>{
 const original=FlowChartExecutor.prototype.getSnapshot,count=FlowChartExecutor.prototype.getCommitCount;
 const id='pending-refresh-'+phase+'-pre-effect',key=phase==='ref'?'pendingRefreshRefPreEffect':'pendingRefreshMetadataPreEffect';let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this),row=s.commitLog.find(x=>x.stageId===id);if(!row)return s;touched=true;
   if(kind==='stage')return {...s,commitLog:s.commitLog.map(x=>x===row?{...x,stageId:'saved-authority-claim'}:x)};
   if(kind==='digest')return {...s,commitLog:s.commitLog.map(x=>x===row?{...x,overwrite:{...x.overwrite,[key]:{...x.overwrite[key],receiptRef:'f'.repeat(64)}}}:x)};
   return s;
  };
  if(kind==='count')FlowChartExecutor.prototype.getCommitCount=function(){return count.call(this)+(touched?1:0);};
  const f=await refreshFixture(),result=await entry()({...f.makeInvocation(),completed:true,preEffectCommitted:true,executor:{getSnapshot:()=>({})}});
  assert.equal(touched,true);assert.equal(result.status,'technical-failure');assert.equal(f.patches.length,0);
  assert.equal(f.refMoves.length,phase==='metadata'?1:0);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;FlowChartExecutor.prototype.getCommitCount=count;}
});
for(const status of [401,403,422,501])test('known ref HTTP '+status+' is technical with its attempted state preserved',async()=>{
 const f=await refreshFixture({refStatus:status,refApply:false}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'technical-failure');assert.equal(result.report.refOutcome,status===501?'failed':'rejected');
 assert.equal(result.report.refMoved,null);assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(f.f.tip,f.P);
});
test('uncertain unapplied ref is verified at old P without inferred absence or a metadata retry',async()=>{
 const f=await refreshFixture({refStatus:503,refApply:false}),result=await entry()(f.makeInvocation());
 assert.equal(result.status,'refresh-verify-only');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(result.report.refMoved,null);assert.equal(f.f.tip,f.P);
});
test('known wrong metadata reply cannot be erased by a healthy later GET after the acknowledged ref',async()=>{
 let changed=0;const f=await refreshFixture({metadataResponseChange:data=>{changed++;data.body='wrong-returned-body';}}),result=await entry()(f.makeInvocation());
 assert.equal(changed,1,'actual metadata reply transform exercised exactly once');
 assert.equal(result.status,'technical-failure');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);
 assert.equal(result.report.refOutcome,'acknowledged');assert.equal(result.report.metadataSubmission,'returned');
});
test('truncated native diagnostics stay technical despite real synthetic returned ref/metadata outcomes',async()=>{
 const f=await refreshFixture(),result=await entry()({...f.makeInvocation(),recordLimitBytes:256});
 assert.equal(result.status,'technical-failure');assert.equal(result.record.complete,false);
 assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);assert.equal(result.report.nextPhaseAdmitted,false);
});
