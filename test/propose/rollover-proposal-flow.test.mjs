import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {rolloverProposalFixture} from './rollover-proposal-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-rollover-successor.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottraceRolloverProposal,'function','ordinary owning native create-PR continuation absent');return implementation.runFoottraceRolloverProposal;}
test('ordinary known native object/ref ACKs create ONE exact App PR and observe complete N/M/L without release authority',async()=>{
 const run=entry(),f=await rolloverProposalFixture(),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-proposed');assert.equal(r.record.complete,true);assert.equal(f.refMoves.length,1);assert.equal(f.prCreates.length,1);
 assert.equal(r.report.prSubmission,'acknowledged');assert.equal(r.report.prObserved,true);assert.equal(r.report.prCreated,true);
 assert.equal(r.report.nextPhaseAdmitted,false);assert.equal(r.report.releaseReady,false);
 const p=f.f.pulls.find(x=>x.state==='open');assert.equal(p.number,r.report.prNumber);assert.equal(p.auto_merge,null);
 assert.equal(p.head.sha,f.f.tip);assert.equal(p.base.sha,f.M);assert.equal(p.body,f.prCreates[0].body);
});
for(const apply of [true,false])test('ordinary uncertain ref applied='+apply+' cannot create a PR even when N is observed',async()=>{
 const run=entry(),f=await rolloverProposalFixture({refStatus:503,refApply:apply}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(r.report.refOutcome,'uncertain');assert.equal(f.prCreates.length,0);
 assert.equal(r.report.prSubmission,'not-attempted');
});
for(const apply of [true,false])test('ordinary uncertain createPR applied='+apply+' remains GET-only and cannot be retried across invocations',async()=>{
 const run=entry(),f=await rolloverProposalFixture({prStatus:503,prApply:apply}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(r.report.prSubmission,'uncertain');assert.equal(r.report.prCreated,null);
 assert.equal(r.report.prObserved,apply);assert.equal(f.prCreates.length,1);const before=f.refMoves.length;
 const later=await run(f.makeInvocation());assert.notEqual(later.status,'rollover-proposed');assert.equal(f.prCreates.length,1);assert.equal(f.refMoves.length,before);
});
test('ordinary known inconsistent createPR reply remains RETURNED technical despite healthy GET state',async()=>{
 const run=entry(),f=await rolloverProposalFixture({prReplyChange:p=>{p.user.login='unrelated[bot]';}}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(r.report.prSubmission,'returned');assert.equal(r.report.prCreated,null);assert.equal(f.prCreates.length,1);
});
test('ordinary createPR requires exact actual native pre-effect payload before submission',async()=>{
 const run=entry(),original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this),pre=s.commitLog.findLast(x=>x.stageId==='rollover-pr-pre-effect');if(!pre)return s;touched=true;
   return {...s,commitLog:s.commitLog.map(x=>x===pre?{...x,overwrite:{...x.overwrite,rolloverPrPreEffect:{...x.overwrite.rolloverPrPreEffect,receiptRef:'f'.repeat(64)}}}:x)};
  };
  const f=await rolloverProposalFixture(),r=await run(f.makeInvocation());
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.prCreates.length,0);assert.equal(r.report.refOutcome,'acknowledged');
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});

test('ordinary createPR final local source/current-writer guard stays fresh after signed-N INPUT with blob reuse',async()=>{
 const run=entry(),snapshot=FlowChartExecutor.prototype.getSnapshot;let armed=false,touched=false,dirty=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const s=snapshot.call(this);if(s.commitLog.some(x=>x.stageId==='rollover-pr-pre-effect'))armed=true;return s;};
  const f=await rolloverProposalFixture({commitChange:()=>{if(armed){touched=true;dirty=true;}}});
  const invocation=f.makeInvocation(),clean=invocation.host.requireClean;
  invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw Error('OFFLINE local source changed');return clean();}};
  const r=await run(invocation);assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.prCreates.length,0);
  assert.equal(r.report.refOutcome,'acknowledged');assert.equal(r.report.prSubmission,'not-attempted');
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;}
});
