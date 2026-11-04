import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {rolloverSuccessorFixture,PRIVATE} from './rollover-successor-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-rollover-successor.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottraceRolloverPreparation,'function','ordinary SAME native owning object phase absent');return implementation.runFoottraceRolloverPreparation;}
test('ordinary ONE native owner prepares exact M/L objects without moving L or creating a PR',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture(),invocation=f.makeInvocation(),r=await run(invocation);
 assert.equal(r.status,'rollover-prepared');assert.equal(r.record.complete,true);assert.equal(r.report.authorized,false);
 assert.equal(r.report.refMoved,false);assert.equal(r.report.releaseReady,false);assert.equal(r.report.nextPhaseAdmitted,false);
 assert.deepEqual(f.effects.at(-1).payload.parents,[f.M,f.f.originalHead]);assert.equal(f.f.tip,f.f.originalHead);
 assert.equal(f.calls.some(c=>c.method==='PATCH'||(c.method==='POST'&&c.path.endsWith('/pulls'))),false);
 assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 const ids=r.record.snapshot.commitLog.map(x=>x.stageId);
 assert.ok(ids.indexOf('proposal-bootstrap-result')<ids.indexOf('rollover-inspection-result'));
 assert.equal(ids.filter(x=>x==='rollover-objects-pre-effect').length,f.effects.length);
});
test('ordinary uncertain commit is GET-only/HOLD with no invented head or later effect',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture({effectStatus:p=>p.endsWith('/git/commits')?503:201}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-verify-only');assert.equal(r.report.submission,'uncertain');assert.equal(r.report.verified,false);
 assert.equal(r.report.attempted,r.report.acknowledged+1);assert.equal(f.effects.at(-1).path.endsWith('/git/commits'),true);
 assert.equal(Object.hasOwn(r.record.snapshot.sharedState.rolloverObjectResult,'headSha'),false);
});
test('ordinary actual archive refusal prevents EVERY object',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture();f.cohorts.find(c=>c.artifact?.id===800).artifact.expired=true;
 const r=await run(f.makeInvocation());assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
});
test('ordinary native published-producer attempt uncertainty cannot become current writer authority',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture(),a=[...f.f.releases.values()][0].assets[0],m=JSON.parse(a.raw);
 m.runAttempt=2;a.raw=Buffer.from(JSON.stringify(m));
 const r=await run(f.makeInvocation());assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
});
test('ordinary EACH object retains final source/writer check after prior acknowledged work',async()=>{
 const run=entry();let dirty=false;
 const f=await rolloverSuccessorFixture({effectChange:()=>{dirty=true;}}),invocation=f.makeInvocation(),clean=invocation.host.requireClean;
 invocation.host={...invocation.host,requireClean:()=>{if(dirty)throw new Error(PRIVATE);return clean();}};
 const r=await run(invocation);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,1);assert.equal(r.report.acknowledged,1);
});
test('ordinary actual pre-effect payload cannot be replaced by a saved diagnostic claim',async()=>{
 const run=entry(),original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this),pre=s.commitLog.findLast(x=>x.stageId==='rollover-objects-pre-effect');
   if(!pre)return s;touched=true;
   return {...s,commitLog:s.commitLog.map(x=>x===pre?{...x,overwrite:{...x.overwrite,rolloverObjectPreEffect:{...x.overwrite.rolloverObjectPreEffect,receiptRef:'f'.repeat(64)}}}:x)};
  };
  const f=await rolloverSuccessorFixture(),r=await run({...f.makeInvocation(),completed:true,execution:()=>({}),getInput:()=>({authorized:true})});
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});
test('ordinary uncertain blob observing exact bytes still stops before every later mutation',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture({effectStatus:503}),r=await run(f.makeInvocation());
 assert.equal(r.status,'rollover-verify-only');assert.equal(r.report.verified,true);assert.equal(f.effects.length,1);
 assert.equal(r.report.acknowledged,0);assert.equal(f.f.tip,f.f.originalHead);
});

test('ordinary full native history/reservation closure is reacquired before the SECOND object',async()=>{
 const run=entry();let armed=false,f;
 f=await rolloverSuccessorFixture({effectChange:()=>{armed=true;},change:(data,path)=>{
  if(armed&&path.includes('/assets?')&&!data.some(row=>row.id===77667))
   data.push({id:77667,name:'publish-attempt-'+f.prepared.version+'.json',state:'uploaded',size:12});
 }});
 const r=await run(f.makeInvocation());assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,1);assert.equal(r.report.acknowledged,1);
});
test('ordinary public DATA cannot select completion, input, executor or a different parent role',async()=>{
 const run=entry(),f=await rolloverSuccessorFixture(),r=await run({...f.makeInvocation(),completed:()=>true,execution:()=>({}),
  getInput:()=>({previousHead:f.P,authorized:true}),root:{getBackend:()=>({authorized:true})},continuation:()=>{throw Error('DATA continuation ran');}});
 assert.equal(r.status,'rollover-prepared');assert.deepEqual(f.effects.at(-1).payload.parents,[f.M,f.f.originalHead]);
 assert.equal(r.report.authorized,false);assert.equal(f.f.tip,f.f.originalHead);
});
