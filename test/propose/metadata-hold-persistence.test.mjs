import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../../src/record.mjs';
import {createMetadataHoldSignalStage} from '../../src/propose/metadata-hold-signals.mjs';
const file=new URL('../../src/propose/metadata-hold-persistence.mjs',import.meta.url);
const implementation=fs.existsSync(file)?await import(file):{};
const create=options=>{
 assert.equal(typeof implementation.createMetadataHoldPersistenceStage,'function','owning native diagnostic output stage is missing');
 return implementation.createMetadataHoldPersistenceStage(options);
};
async function execute(builder,initialContext={},recordLimitBytes){
 const chart=builder.build(),executor=new FlowChartExecutor(chart,{initialContext,commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));
 let completed=false;try{await executor.run();completed=true;}catch{}
 const snapshot=completed?executor.getSnapshot():undefined;
 return {snapshot,record:captureRecord({snapshot,structure:chart.buildTimeStructure,completed,recordLimitBytes,reason:'NATIVE_FAILURE'})};
}
function composed(ports,readSignal){
 const hold=createMetadataHoldSignalStage({readHold:()=>({proposeOutcome:'hold-metadata-stale',jobConclusion:null})});
 const persistence=create({start:hold.chart,readSignal:readSignal??hold.getSignals,...ports});
 return {hold,persistence};
}
function node(snapshot,id){
 const visit=value=>{if(!value||typeof value!=='object')return null;if(value.id===id)return value;for(const child of Object.values(value)){const found=visit(child);if(found)return found;}return null;};
 return visit(snapshot.executionTree);
}
test('one composed native chart saves real diagnostic files and records its IO dependency without release authority',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-propose-hold-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const summary=path.join(root,'summary'),output=path.join(root,'output'),calls=[];
 const {persistence}=composed({appendSummary:async s=>{calls.push('summary');fs.appendFileSync(summary,s);},appendOutput:async s=>{calls.push('output');fs.appendFileSync(output,s);}});
 const r=await execute(persistence.chart,{localDiagnosticIO:true});
 assert.equal(r.record.complete,true);assert.deepEqual(calls,['summary','output']);
 assert.equal(fs.readFileSync(output,'utf8'),'proposeOutcome=hold-metadata-stale\n');assert.match(fs.readFileSync(summary,'utf8'),/held/i);
 const result=persistence.getResult();assert.equal(result.diagnosticSaved,true);assert.equal(result.downstreamBlocked,true);
 assert.equal(result.terminalAdmission,false);assert.equal(result.releaseReady,false);assert.equal(result.authorized,false);
 assert.equal(r.snapshot.sharedState.metadataHoldOutputResult.diagnosticSaved,true);
 const write=node(r.snapshot,'metadata-hold-output-save');assert.ok(write);
 const end=node(r.snapshot,'metadata-hold-output-result');assert.ok(end);
 assert.ok(end.stageReads,'result stage must have real native reads');
 assert.equal(Object.hasOwn(end.stageReads,'metadataHoldOutputFacts'),true);
 assert.equal(end.stageReads.metadataHoldOutputFacts.saved,true);
 assert.equal(r.snapshot.sharedState.readOnly,undefined);assert.equal(r.snapshot.sharedState.localDiagnosticIO,true);
});
test('declared read-only context refuses before any diagnostic IO',async()=>{
 let calls=0;const {persistence}=composed({appendSummary:async()=>calls++,appendOutput:async()=>calls++});
 const r=await execute(persistence.chart,{readOnly:true});assert.equal(r.record.complete,false);assert.equal(calls,0);assert.equal(persistence.getResult(),null);
});
test('native IO awaits summary and output before recording saved result',async()=>{
 let releaseSummary,releaseOutput;const order=[];
 const summary=new Promise(r=>releaseSummary=r),output=new Promise(r=>releaseOutput=r);
 const {persistence}=composed({appendSummary:async()=>{order.push('summary');await summary;},appendOutput:async()=>{order.push('output');await output;}});
 const running=execute(persistence.chart);await new Promise(r=>setImmediate(r));
 assert.deepEqual(order,['summary']);assert.equal(persistence.getResult(),null);
 releaseSummary();await new Promise(r=>setImmediate(r));assert.deepEqual(order,['summary','output']);assert.equal(persistence.getResult(),null);
 releaseOutput();const r=await running;assert.equal(r.record.complete,true);assert.equal(persistence.getResult().diagnosticSaved,true);
});
for(const failAt of ['summary','output'])test('native '+failAt+' uncertainty remains diagnostic failure and no append retry',async()=>{
 const calls=[];const {persistence,hold}=composed({appendSummary:async()=>{calls.push('summary');if(failAt==='summary')throw Error('PRIVATE-PARTIAL');},
  appendOutput:async()=>{calls.push('output');throw Error('PRIVATE-PARTIAL');}});
 const r=await execute(persistence.chart);assert.equal(r.record.complete,true);
 assert.equal(persistence.getResult().diagnosticSaved,false);assert.equal(persistence.getResult().partialSavePossible,true);
 assert.equal(persistence.getResult().authorized,false);assert.equal(persistence.getResult().terminalAdmission,false);
 assert.equal(JSON.stringify(r.record).includes('PRIVATE-PARTIAL'),false);
 assert.deepEqual(calls,failAt==='summary'?['summary']:['summary','output']);
 const again=create({readSignal:hold.getSignals,appendSummary:async()=>calls.push('retry-summary'),appendOutput:async()=>calls.push('retry-output')});
 await execute(again.chart);assert.equal(again.getResult().diagnosticSaved,false);assert.equal(calls.includes('retry-summary'),false);
});
test('copied model fields do not reach the diagnostic write stage',async()=>{
 let calls=0;const {persistence,hold}=composed({appendSummary:async()=>calls++,appendOutput:async()=>calls++},()=>JSON.parse(JSON.stringify(hold.getSignals())));
 const r=await execute(persistence.chart);assert.equal(r.record.complete,true);assert.equal(calls,0);
 assert.equal(persistence.getResult().diagnosticSaved,false);assert.equal(persistence.getResult().partialSavePossible,false);
});
test('source read failures keep raw errors outside the native record and never append',async()=>{
 let calls=0;const persistence=create({readSignal:()=>{throw Error('PRIVATE-SOURCE');},appendSummary:async()=>calls++,appendOutput:async()=>calls++});
 const r=await execute(persistence.chart);assert.equal(r.record.complete,true);assert.equal(calls,0);
 assert.equal(JSON.stringify(r.record).includes('PRIVATE-SOURCE'),false);assert.equal(persistence.getResult().diagnosticSaved,false);
});
test('a native stage instance cannot run twice or retain a successful result for a failed rerun',async()=>{
 let calls=0;const hold=createMetadataHoldSignalStage({readHold:()=>({proposeOutcome:'hold-metadata-stale',jobConclusion:null})});
 assert.equal((await execute(hold.chart)).record.complete,true);
 const persistence=create({readSignal:hold.getSignals,appendSummary:async()=>calls++,appendOutput:async()=>calls++});
 assert.equal((await execute(persistence.chart)).record.complete,true);assert.equal(calls,2);
 assert.equal((await execute(persistence.chart)).record.complete,false);assert.equal(persistence.getResult(),null);assert.equal(calls,2);
});
test('record truncation cannot become terminal or release authority after local diagnostic writes',async()=>{
 const {persistence}=composed({appendSummary:async()=>{},appendOutput:async()=>{}});
 const r=await execute(persistence.chart,{},256);assert.equal(r.record.complete,false);
 assert.equal(persistence.getResult().authorized,false);assert.equal(persistence.getResult().terminalAdmission,false);assert.equal(persistence.getResult().releaseReady,false);
});
