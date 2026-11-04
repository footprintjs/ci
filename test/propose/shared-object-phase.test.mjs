import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {successorFixture} from './pending-successor-provider-fixture.mjs';
import {runFoottracePendingSuccessorPreparation} from '../../src/propose/foottrace-pending-successor.mjs';
const shared=await import('../../src/propose/proposal-object-flow.mjs').catch(()=>({}));
function entries(){
 for(const name of ['appendFoottracePendingObjectPhase','appendFoottraceRolloverObjectPhase'])
  assert.equal(typeof shared[name],'function','single shared native object phase CODE entry absent');
}
test('shared native object phase preserves ONE pending owner, iteration commits and exact M/P',async()=>{
 entries();const f=await successorFixture(),r=await runFoottracePendingSuccessorPreparation(f.makeInvocation());
 assert.equal(r.status,'successor-prepared');assert.equal(r.record.complete,true);
 const ids=r.record.snapshot.commitLog.map(row=>row.stageId);
 assert.equal(ids.filter(x=>x==='pending-successor-pre-effect').length,f.effects.length);
 assert.equal(ids.filter(x=>x==='pending-successor-apply').length,f.effects.length);
 assert.ok(ids.indexOf('proposal-bootstrap-result')<ids.indexOf('pending-successor-inputs'));
 assert.deepEqual(f.effects.at(-1).payload.parents,[f.M,f.P]);assert.equal(f.f.tip,f.P);
});
test('shared object phase preserves uncertain commit without inventing a signed head or later effect',async()=>{
 entries();const f=await successorFixture({effectStatus:path=>path.endsWith('/git/commits')?503:201});
 const r=await runFoottracePendingSuccessorPreparation(f.makeInvocation());
 assert.equal(r.status,'successor-verify-only');assert.equal(r.report.submission,'uncertain');assert.equal(r.report.verified,false);
 assert.equal(r.report.attempted,r.report.acknowledged+1);assert.equal(f.effects.at(-1).path.endsWith('/git/commits'),true);
 assert.equal(Object.hasOwn(r.record.snapshot.sharedState.pendingSuccessorResult,'headSha'),false);
});
test('shared phase still requires the FINAL current source/writer recheck after earlier acknowledged objects',async()=>{
 entries();let dirty=false;const f=await successorFixture({effectChange:()=>{dirty=true;}}),invocation=f.makeInvocation(),clean=invocation.host.requireClean;
 invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw new Error('OFFLINE changed source');return clean();}};
 const r=await runFoottracePendingSuccessorPreparation(invocation);
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,1);assert.equal(r.report.acknowledged,1);
});
test('shared phase accepts no saved native count instead of actual owning executor completion',async()=>{
 entries();const count=FlowChartExecutor.prototype.getCommitCount;let touched=false;
 try{
  FlowChartExecutor.prototype.getCommitCount=function(){
   const n=count.call(this),s=this.getSnapshot();
   if(s.commitLog.some(row=>row.stageId==='pending-successor-pre-effect')){touched=true;return n+1;}return n;
  };
  const f=await successorFixture(),r=await runFoottracePendingSuccessorPreparation({...f.makeInvocation(),execution:()=>({}),completed:true});
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
 }finally{FlowChartExecutor.prototype.getCommitCount=count;}
});
