import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {runFoottraceMetadataReconciliation} from '../../src/propose/foottrace-metadata-reconciliation.mjs';
const controller=await import('../../src/propose/foottrace-metadata-reconciliation.mjs');
const io=await import('../../src/propose/proposal-outcome-output.mjs').catch(()=>({}));
function entry(){assert.equal(typeof controller.runFoottraceMetadataReconciliationWithOutput,'function','actual C1 terminal and named output are not composed in one executor');return controller.runFoottraceMetadataReconciliationWithOutput;}
function writer(ports){assert.equal(typeof io.createProposalOutcomeOutput,'function','fixed proposal outcome writer is missing');return io.createProposalOutcomeOutput(ports);}
const match='proposeOutcome=metadata-matched\n',hold='proposeOutcome=hold-metadata-stale\n';
async function run(options={},extra={}){
 const f=await metadataC1Fixture(options),events=[],invocation=f.makeInvocation();
 const result=await entry()({...invocation,appendSummary:async text=>events.push(['summary',text]),
  appendOutput:async text=>events.push(['output',text]),...extra});
 return {f,result,events};
}
test('native match uses the SAME exact outcome spelling accepted by the existing business gate',async()=>{
 const f=await metadataC1Fixture({exact:true}),r=await runFoottraceMetadataReconciliation(f.makeInvocation());
 assert.equal(r.report.proposeOutcome,'metadata-matched');
});
for(const [status,line] of [['metadata-match',match],['metadata-hold',hold]])test('fixed '+status+' output persists summary before one exact named line and grants no terminal authority',async()=>{
 const events=[],w=writer({appendSummary:async text=>events.push(['summary',text]),appendOutput:async text=>events.push(['output',text])});
 const r=await w.write(status);
 assert.equal(events.length,2);assert.equal(events[0][0],'summary');assert.equal(events[1][0],'output');assert.equal(events[1][1],line);
 assert.equal(r.diagnosticSaved,true);assert.equal(r.authorized,false);assert.equal(r.terminalAdmission,false);
 await assert.rejects(()=>w.write(status));assert.equal(events.length,2);
});
test('fixed writer awaits summary completion before appending the named output',async()=>{
 let finish,started=false;const done=new Promise(resolve=>{finish=resolve;}),events=[];
 const w=writer({appendSummary:async()=>{started=true;await done;events.push('summary');},appendOutput:async()=>events.push('output')});
 const pending=w.write('metadata-match');
 try{assert.equal(started,true);assert.deepEqual(events,[]);}
 finally{finish();await pending;}
 assert.deepEqual(events,['summary','output']);
});
test('invalid rich, inherited and alternate outcome names cannot write or disclose private input',async()=>{
 for(const status of ['match','constructor',PRIVATE,{status:'metadata-match',private:PRIVATE},null]){
  let calls=0;const w=writer({appendSummary:async()=>{calls++;},appendOutput:async()=>{calls++;}});
  await assert.rejects(()=>w.write(status),e=>!String(e).includes(PRIVATE));
  assert.equal(calls,0);
  await assert.doesNotReject(()=>w.write('metadata-match'),'invalid outcome must not consume an unopened output attempt');
  assert.equal(calls,2);
 }
});
test('a fixed writer never retries after uncertain output append',async()=>{
 let summaries=0,outputs=0;const w=writer({appendSummary:async()=>{summaries++;},appendOutput:async()=>{outputs++;throw Error(PRIVATE);}});
 await assert.rejects(()=>w.write('metadata-match'),e=>!String(e).includes(PRIVATE));
 await assert.rejects(()=>w.write('metadata-match'));
 assert.equal(summaries,1);assert.equal(outputs,1);
});
test('actual C1 native terminal precedes the awaited summary and exact match output',async()=>{
 const {f,result,events}=await run();
 assert.equal(result.status,'metadata-match');assert.equal(f.patches.length,1);assert.equal(events.length,2);
 assert.equal(events[1][1],match);assert.equal(result.report.output.saved,true);
 const ids=result.record.snapshot.commitLog.map(x=>x.stageId);
 assert.ok(ids.indexOf('metadata-c1-terminal')>=0);assert.ok(ids.indexOf('metadata-c1-output')>ids.indexOf('metadata-c1-terminal'));
 assert.equal(JSON.stringify(result).includes(PRIVATE),false);
});
test('uncertain verified stale C1 produces the explicit HOLD line while business continuation stays blocked',async()=>{
 const {f,result,events}=await run({status:503,apply:false});
 assert.equal(result.status,'metadata-hold');assert.equal(f.patches.length,1);assert.equal(events[1][1],hold);
 assert.equal(result.report.proposeOutcome,'hold-metadata-stale');assert.equal(result.report.releaseReady,false);
});
test('summary failure after the real C1 terminal is technical, with no output attempt or retry',async()=>{
 let summaries=0,outputs=0;const {result}=await run({},{
  appendSummary:async()=>{summaries++;throw Error(PRIVATE);},appendOutput:async()=>{outputs++;}
 });
 assert.equal(result.status,'technical-failure');assert.equal(summaries,1);assert.equal(outputs,0);
 assert.equal(result.report.output.attempted,true);assert.equal(result.report.output.partialSavePossible,true);
 assert.equal(result.report.output.saved,false);assert.equal(result.record.complete,false);assert.equal(JSON.stringify(result).includes(PRIVATE),false);
});
test('uncertain output append stays technical and preserves the actual partial save diagnostic',async()=>{
 let outputs=0;const {result}=await run({}, {appendOutput:async()=>{outputs++;throw Error(PRIVATE);}});
 assert.equal(result.status,'technical-failure');assert.equal(outputs,1);assert.equal(result.report.output.partialSavePossible,true);
 assert.equal(result.record.complete,false);assert.ok(result.record.snapshot.commitLog.some(x=>x.stageId==='metadata-c1-terminal'));
});
test('invalid output CODE ports refuse before any provider mutation',async()=>{
 const {f,result}=await run({}, {appendOutput:null});
 assert.equal(result.status,'technical-failure');assert.equal(f.patches.length,0);
});
test('a technical repository failure never becomes a successful reported HOLD or match output',async()=>{
 const {result,events}=await run({status:403,apply:false});
 assert.equal(result.status,'technical-failure');assert.deepEqual(events,[]);assert.equal(result.report.output.saved,false);
});
test('a claimed terminal stage or supplied completion flag cannot authorize named output',async()=>{
 const snapshot=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const value=snapshot.call(this);
   if(value.commitLog.some(x=>x.stageId==='metadata-c1-terminal')){
    touched=true;return {...value,commitLog:value.commitLog.map(x=>x.stageId==='metadata-c1-terminal'?{...x,stageId:'claimed-terminal'}:x)};
   }return value;
  };
  const {result,events}=await run({}, {completed:true,terminalAdmission:true});
  assert.equal(touched,true);assert.equal(result.status,'technical-failure');assert.deepEqual(events,[]);
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;}
});
test('the no-output CODE entry ignores supplied append callbacks',async()=>{
 const f=await metadataC1Fixture({exact:true});let calls=0;
 const result=await runFoottraceMetadataReconciliation({...f.makeInvocation(),appendSummary:()=>{calls++;},appendOutput:()=>{calls++;}});
 assert.equal(result.status,'metadata-match');assert.equal(calls,0);
});

test('fixed output attempt locks before the first pending append and rejects a concurrent repeat',async()=>{
 let release;const pendingSummary=new Promise(resolve=>{release=resolve;}),events=[];
 const w=writer({appendSummary:async()=>{events.push('summary');await pendingSummary;},appendOutput:async()=>events.push('output')});
 const first=w.write('metadata-match');
 let duplicate='pending';
 const repeated=w.write('metadata-match').then(()=>{duplicate='resolved';},()=>{duplicate='rejected';});
 await new Promise(resolve=>setImmediate(resolve));
 try{assert.equal(duplicate,'rejected','repeat must refuse before waiting on the pending first append');assert.deepEqual(events,['summary']);}
 finally{release();await first;await repeated;}
 assert.deepEqual(events,['summary','output']);
});
test('fixed output completion awaits the output append itself',async()=>{
 let release;const outputDone=new Promise(resolve=>{release=resolve;});let settled=false,outputStarted=false;
 const w=writer({appendSummary:async()=>{},appendOutput:async()=>{outputStarted=true;await outputDone;}});
 const pending=w.write('metadata-match').then(()=>{settled=true;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(outputStarted,true);
 try{assert.equal(settled,false,'persistence cannot report saved while the actual output append is pending');}
 finally{release();await pending;}
 assert.equal(settled,true);
});
test('saved native output explanation retains actual terminal and verification value dependencies',async()=>{
 const {result}=await run();assert.equal(result.record.complete,true);
 const visit=(v,id)=>{if(!v||typeof v!=='object')return null;if(v.id===id)return v;for(const child of Object.values(v)){const found=visit(child,id);if(found)return found;}return null;};
 const terminal=visit(result.record.snapshot.executionTree,'metadata-c1-terminal'),output=visit(result.record.snapshot.executionTree,'metadata-c1-output');
 assert.ok(terminal);assert.ok(output);
 assert.ok(terminal.stageReads,'terminal needs actual native verification reads');
 assert.equal(Object.hasOwn(terminal.stageReads,'metadataC1Facts'),true);
 assert.equal(terminal.stageReads.metadataC1Facts.verified,true);
 assert.ok(output.stageReads,'output needs actual native terminal reads');
 assert.equal(Object.hasOwn(output.stageReads,'metadataC1Result'),true);
 assert.equal(output.stageReads.metadataC1Result.verified,true);
});

test('the owning native controller awaits the output writer before claiming its final completion',async()=>{
 let release,started;const outputDone=new Promise(resolve=>{release=resolve;}),outputStarted=new Promise(resolve=>{started=resolve;});let settled=false;
 const f=await metadataC1Fixture(),invocation=f.makeInvocation();
 const pending=entry()({...invocation,appendSummary:async()=>{},appendOutput:async()=>{started();await outputDone;}}).then(value=>{settled=true;return value;});
 await outputStarted;await new Promise(resolve=>setImmediate(resolve));
 let result;
 try{assert.equal(settled,false,'controller cannot finish while its fixed output writer is pending');}
 finally{release();result=await pending;}
 assert.equal(result.status,'metadata-match');assert.equal(result.report.output.saved,true);
});
