import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMetadataHoldSignalStage} from '../../src/propose/metadata-hold-signals.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
import {runEcoStatus,explainEcoRecord} from '../../src/eco/status-flow.mjs';
import {createEcoReader} from '../../src/eco/github-reader.mjs';
const writerPath=new URL('../../src/propose/metadata-hold-output.mjs',import.meta.url);
const gatePath=new URL('../../src/propose/proposal-business-gate.mjs',import.meta.url);
const writer=fs.existsSync(writerPath)?await import(writerPath):{},gate=fs.existsSync(gatePath)?await import(gatePath):{};
function output(options){assert.equal(typeof writer.createMetadataHoldOutput,'function','native HOLD output writer is missing');return writer.createMetadataHoldOutput(options);}
function business(options){assert.equal(typeof gate.createProposalBusinessGate,'function','native business output gate is missing');return gate.createProposalBusinessGate(options);}
async function hold(){
 const s=createMetadataHoldSignalStage({readHold:()=>({proposeOutcome:'hold-metadata-stale',jobConclusion:null})});
 assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);return s.getSignals();
}
async function observe(value){
 const s=business({readOutput:()=>value}),r=await runNativeObservationRecord({chart:s.chart});
 return {...r,observation:s.getObservation()};
}
const H='proposeOutcome=hold-metadata-stale\n',M='proposeOutcome=metadata-matched\n';
test('actual saved HOLD output and summary reach the native downstream gate and eco as an open hold despite job SUCCESS',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'propose-business-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const out=path.join(root,'output'),summary=path.join(root,'summary'),calls=[];
 const p=output({appendSummary:async bytes=>{calls.push('summary');fs.appendFileSync(summary,bytes);},
  appendOutput:async bytes=>{calls.push('output');fs.appendFileSync(out,bytes);}});
 const result=await p.write(await hold());assert.deepEqual(calls,['summary','output']);
 assert.equal(result.diagnosticSaved,true);assert.equal(result.terminalAdmission,false);assert.equal(result.authorized,false);
 assert.equal(fs.readFileSync(out,'utf8'),H);assert.match(fs.readFileSync(summary,'utf8'),/held/i);
 const r=await observe({output:fs.readFileSync(out,'utf8'),conclusion:'success'});assert.equal(r.record.complete,true);
 assert.equal(r.observation.status,'held');assert.equal(r.observation.businessGatePassed,false);assert.equal(r.observation.releaseReady,false);
 const eco=await runEcoStatus({target:{repository:'footprintjs/ci',pullNumber:2,action:'merge-source'},businessOutcome:r.observation,
  reader:createEcoReader({fetcher:async()=>{throw new Error('PRIVATE-ECO');}})});
 assert.equal(eco.status,'held');assert(eco.report.findings.includes('metadata-stale'));assert.equal(eco.report.authorized,false);
 assert.equal(eco.report.executedWrites,0);assert.equal(JSON.stringify(eco).includes('PRIVATE-ECO'),false);
 assert.match(explainEcoRecord(eco.record,'reportFacts'),/observeBusinessFacts/);
 assert.match(eco.record.snapshot.sharedState.observeBusinessFacts.receiptRef,/^[a-f0-9]{64}$/);
 let diffNode=eco.record.snapshot.executionTree;
 while(diffNode&&diffNode.id!=='diff')diffNode=diffNode.next;
 assert.ok(diffNode);assert.equal(Object.hasOwn(diffNode.stageReads,'observeBusinessFacts'),true);
 assert.equal(diffNode.stageReads.observeBusinessFacts.receiptRef,eco.record.snapshot.sharedState.observeBusinessFacts.receiptRef);

});
test('reported MATCH plus successful job passes only the business gate and establishes no release or effect authority',async()=>{
 const r=await observe({output:M,conclusion:'success'});assert.equal(r.observation.status,'matched');
 assert.equal(r.observation.businessGatePassed,true);assert.equal(r.observation.releaseReady,false);assert.equal(r.observation.authorized,false);
});
for(const conclusion of [null,'failure','cancelled'])test('reported MATCH never converts '+conclusion+' into a successful downstream business gate',async()=>{
 const r=await observe({output:M,conclusion});assert.equal(r.observation.businessGatePassed,false);assert.equal(r.observation.releaseReady,false);
});
for(const bytes of ['',H+H,H+'PRIVATE=raw\n',' '+H,'x'.repeat(1025)])test('missing, repeated or malformed output cannot pass the business gate',async()=>{
 const r=await observe({output:bytes,conclusion:'success'});assert.equal(r.observation.businessGatePassed,false);
 assert.equal(r.observation.status,'unknown');assert.equal(JSON.stringify(r.record).includes('PRIVATE=raw'),false);
});
test('summary save failure stops before machine output and cannot be retried through another writer',async()=>{
 const signal=await hold();let summaries=0,outputs=0;
 const p=output({appendSummary:async()=>{summaries++;throw new Error('PRIVATE-SUMMARY');},appendOutput:async()=>{outputs++;}});
 await assert.rejects(p.write(signal),{message:'metadata-hold-output-unavailable'});assert.equal(summaries,1);assert.equal(outputs,0);
 await assert.rejects(output({appendSummary:async()=>summaries++,appendOutput:async()=>outputs++}).write(signal));
 assert.equal(summaries,1);assert.equal(outputs,0);
});
test('machine output failure retains the earlier summary and never retries append uncertainty',async()=>{
 const signal=await hold(),calls=[];
 const p=output({appendSummary:async()=>calls.push('summary'),appendOutput:async()=>{calls.push('output');throw new Error('PRIVATE-OUTPUT');}});
 await assert.rejects(p.write(signal),{message:'metadata-hold-output-unavailable'});
 await assert.rejects(p.write(signal));assert.deepEqual(calls,['summary','output']);
});
test('a saved copy of HOLD fields is not a runtime diagnostic writer input',async()=>{
 let calls=0;const p=output({appendSummary:async()=>calls++,appendOutput:async()=>calls++});
 await assert.rejects(p.write(JSON.parse(JSON.stringify(await hold()))));assert.equal(calls,0);
});
test('source and output DATA getters are refused without invocation or private diagnostics',async()=>{
 let reads=0;const value={conclusion:'success'};Object.defineProperty(value,'output',{enumerable:true,get(){reads++;throw new Error('PRIVATE-GETTER');}});
 const r=await observe(value);assert.equal(r.observation.businessGatePassed,false);assert.equal(reads,0);assert.equal(JSON.stringify(r.record).includes('PRIVATE-GETTER'),false);
});
test('saved/model outcome fields cannot clear eco findings or manufacture a collected source',async()=>{
 const eco=await runEcoStatus({target:{repository:'footprintjs/ci',pullNumber:2,action:'merge-source'},
  businessOutcome:{status:'matched',businessGatePassed:true,authorized:true},
  reader:createEcoReader({fetcher:async()=>{throw new Error('PRIVATE');}})});
 assert(eco.report.findings.includes('proposal-outcome-unbound'));assert.notEqual(eco.status,'known');assert.equal(eco.report.authorized,false);
});

test('one diagnostic writer cannot append a second freshly observed signal',async()=>{
 let calls=0;const p=output({appendSummary:async()=>calls++,appendOutput:async()=>calls++});
 await p.write(await hold());await assert.rejects(p.write(await hold()));
 assert.equal(calls,2);
});
