import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {flowChart} from 'footprintjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const file=new URL('../../src/propose/metadata-hold-signals.mjs',import.meta.url);
const module=existsSync(file)?await import(file):{};
function stage(options){
 assert.equal(typeof module.createMetadataHoldSignalStage,'function','T1 business HOLD signal stage is missing');
 return module.createMetadataHoldSignalStage(options);
}
async function run(readHold,extra={}){
 const value=stage({readHold}),execution=await runNativeObservationRecord({chart:value.chart,...extra});
 return {...execution,signals:value.getSignals()};
}
const observed=()=>({proposeOutcome:'hold-metadata-stale',jobConclusion:'success'});
test('a reported stale metadata HOLD emits named output, visible summary and an open finding despite job SUCCESS',async()=>{
 const r=await run(observed);assert.equal(r.record.complete,true);assert.ok(r.signals);
 assert.equal(r.signals.output,'proposeOutcome=hold-metadata-stale\n');
 assert.match(r.signals.summary,/held/i);assert.match(r.signals.summary,/metadata/i);
 assert.equal(r.signals.businessStatus,'held');assert.equal(r.signals.ecoFinding,'metadata-stale');
 assert.equal(r.signals.downstreamBlocked,true);assert.equal(r.signals.authorized,false);
 assert.equal(r.signals.terminalAdmission,false);assert.equal(r.signals.releaseReady,false);
 const state=r.record.snapshot.sharedState;
 assert.equal(state.metadataHoldResult.observed,true);assert.equal(state.metadataHoldResult.downstreamBlocked,true);
 assert.match(JSON.stringify(r.record),/metadata-hold-decision/);
});
for(const conclusion of ['failure','cancelled','skipped'])test('legacy '+conclusion+' is never reclassified as technically complete',async()=>{
 const r=await run(()=>({...observed(),jobConclusion:conclusion}));assert.equal(r.signals.businessStatus,'held');
 assert.equal(r.signals.terminalAdmission,false);assert.equal(r.signals.releaseReady,false);assert.equal(r.signals.downstreamBlocked,true);
});
for(const input of [null,{}, {proposeOutcome:'match',jobConclusion:'success'}, {...observed(),extra:'PRIVATE'}, {...observed(),jobConclusion:'other'}])
 test('unknown or unbounded DATA cannot supply a known HOLD signal or readiness',async()=>{
  const r=await run(()=>input);assert.equal(r.signals,null);assert.equal(r.record.snapshot.sharedState.metadataHoldResult.observed,false);
  assert.equal(r.record.snapshot.sharedState.metadataHoldResult.downstreamBlocked,true);
  assert.equal(JSON.stringify(r.record).includes('PRIVATE'),false);
 });
test('private source errors and DATA accessors never enter native diagnostics',async()=>{
 const r=await run(()=>{throw new Error('PRIVATE-HOLD-ERROR');});assert.equal(r.signals,null);assert.equal(JSON.stringify(r.record).includes('PRIVATE-HOLD-ERROR'),false);
 let reads=0;const value={jobConclusion:'success'};Object.defineProperty(value,'proposeOutcome',{enumerable:true,get(){reads++;return 'hold-metadata-stale';}});
 const a=await run(()=>value);assert.equal(a.signals,null);assert.equal(reads,0);
});
test('the signal stage composes into the owning native chart and owns one invocation only',async()=>{
 const start=flowChart('Trusted preceding observation',scope=>{scope.priorObservation=true;},'prior-observation');
 const value=stage({start,readHold:observed});let execution=await runNativeObservationRecord({chart:value.chart});
 assert.equal(execution.record.complete,true);assert.equal(execution.record.snapshot.sharedState.priorObservation,true);
 execution=await runNativeObservationRecord({chart:value.chart});assert.equal(execution.record.complete,false);assert.equal(value.getSignals(),null);
});
test('a non-callable or DATA callback cannot select the native source reader',()=>{
 for(const readHold of [null,{},true,'hold-metadata-stale'])assert.throws(()=>stage({readHold}));
});

test('the current running job may report HOLD before its real provider conclusion exists',async()=>{
 const r=await run(()=>({...observed(),jobConclusion:null}));
 assert.ok(r.signals);assert.equal(r.signals.downstreamBlocked,true);assert.equal(r.signals.terminalAdmission,false);
 assert.equal(r.signals.output,'proposeOutcome=hold-metadata-stale\n');
 assert.equal(JSON.stringify(r.record).includes('"jobConclusion":"success"'),false);
});
