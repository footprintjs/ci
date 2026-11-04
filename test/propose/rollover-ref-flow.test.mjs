import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {rolloverRefFixture} from './rollover-ref-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-rollover-successor.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottraceRolloverRef,'function','ordinary owning native nonforce ref continuation absent');return implementation.runFoottraceRolloverRef;}
test('ordinary same native owner nonforce moves L to exact N/M/L and stops before an unimplemented PR phase',async()=>{
 const run=entry(),f=await rolloverRefFixture(),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-ref-advanced');assert.equal(r.record.complete,true);assert.equal(f.refMoves.length,1);
 assert.equal(f.refMoves[0].force,false);assert.equal(f.f.tip,f.refMoves[0].sha);assert.deepEqual(f.effects.at(-1).payload.parents,[f.M,f.f.originalHead]);
 assert.equal(r.report.refOutcome,'acknowledged');assert.equal(r.report.refMoved,true);assert.equal(r.report.refObserved,true);
 assert.equal(r.report.prPhaseImplemented,false);assert.equal(r.report.nextPhaseAdmitted,false);assert.equal(r.report.releaseReady,false);
 assert.equal(f.f.pulls.filter(x=>x.state==='open').length,0);
});
for(const apply of [true,false])test('ordinary uncertain ref applied='+apply+' remains GET-only with movement attribution unknown',async()=>{
 const run=entry(),f=await rolloverRefFixture({refStatus:503,refApply:apply}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-ref-verify-only');assert.equal(r.report.refOutcome,'uncertain');assert.equal(r.report.refMoved,null);
 assert.equal(r.report.refObserved,apply);assert.equal(f.refMoves.length,1);assert.equal(r.report.prPhaseImplemented,false);
});
test('ordinary known inconsistent ref reply remains RETURNED and unknown despite healthy provider state',async()=>{
 const run=entry(),f=await rolloverRefFixture({refReplyChange:d=>{d.object.type='tag';}}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(r.report.refOutcome,'returned');assert.equal(r.report.refMoved,null);assert.equal(f.refMoves.length,1);
});
test('ordinary ref requires actual committed native payload, never a diagnostic substitute',async()=>{
 const run=entry(),original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this),pre=s.commitLog.findLast(x=>x.stageId==='rollover-ref-pre-effect');
   if(!pre)return s;touched=true;
   return {...s,commitLog:s.commitLog.map(x=>x===pre?{...x,overwrite:{...x.overwrite,rolloverRefPreEffect:{...x.overwrite.rolloverRefPreEffect,receiptRef:'f'.repeat(64)}}}:x)};
  };
  const f=await rolloverRefFixture(),r=await run({...f.makeInvocation(),completed:true,execution:()=>({})});
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.refMoves.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});
test('ordinary post-ref reservation drift preserves the ACKed ref and refuses all later authority',async()=>{
 const run=entry(),f=await rolloverRefFixture({refEffectChange:f=>{
  [...f.f.releases.values()][0].assets.push({id:99776,name:'publish-attempt-'+f.prepared.version+'.json',state:'uploaded',size:12});
 }}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(r.report.refOutcome,'acknowledged');assert.equal(r.report.refMoved,true);
 assert.equal(f.refMoves.length,1);assert.equal(f.f.pulls.filter(x=>x.state==='open').length,0);
});
test('ordinary uncertain objects cannot reach even the ref pre-effect submission',async()=>{
 const run=entry(),f=await rolloverRefFixture({effectStatus:503}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-ref-verify-only');assert.equal(f.refMoves.length,0);assert.equal(r.report.refMoved,false);
});

for(const kind of ['retained-ref','local-writer-source'])test('ordinary FINAL native '+kind+' guard runs after signed-N observation',async()=>{
 const run=entry(),snapshot=FlowChartExecutor.prototype.getSnapshot;let armed=false,touched=false,dirty=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){const s=snapshot.call(this);if(s.commitLog.some(x=>x.stageId==='rollover-ref-pre-effect'))armed=true;return s;};
  const f=await rolloverRefFixture({commitChange:(data,path,{f})=>{if(armed){touched=true;if(kind==='retained-ref')f.f.tip=f.P;else dirty=true;}}});
  const invocation=f.makeInvocation(),clean=invocation.host.requireClean;
  invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw Error('OFFLINE changed writer source');return clean();}};
  const r=await run(invocation);assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.refMoves.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;}
});
