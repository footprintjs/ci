import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FlowChartExecutor} from 'footprintjs';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {rolloverProposalFixture} from './rollover-proposal-provider-fixture.mjs';
import {createProposalOutcomeOutput} from '../../src/propose/proposal-outcome-output.mjs';
import {createProposalBusinessGate} from '../../src/propose/proposal-business-gate.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
import {wholeProposalTerminalOutcome} from '../../src/propose/proposal-terminal-outcome.mjs';
const implementation=await import('../../src/propose/foottrace-proposal.mjs');
const MATCH='proposeOutcome=metadata-matched\n',STALE='proposeOutcome=hold-metadata-stale\n',VERIFY='proposeOutcome=hold-proposal-uncertain\n';
function entry(){assert.equal(typeof implementation.runFoottraceProposalWithOutput,'function','whole native terminal and exact named output not composed');return implementation.runFoottraceProposalWithOutput;}
async function observe(output,conclusion='success'){
 const s=createProposalBusinessGate({readOutput:()=>({output,conclusion})}),r=await runNativeObservationRecord({chart:s.chart});
 assert.equal(r.record.complete,true);return s.getObservation();
}
async function invoke(f,extra={}){
 const events=[],r=await entry()({...f.makeInvocation(),appendSummary:async text=>events.push(['summary',text]),appendOutput:async text=>events.push(['output',text]),...extra});
 return {r,events};
}
test('fixed shared output protocol reports uncertain proposal distinctly from stale metadata',async()=>{
 const events=[],w=createProposalOutcomeOutput({appendSummary:async t=>events.push(['summary',t]),appendOutput:async t=>events.push(['output',t])});
 await assert.doesNotReject(()=>w.write('proposal-verify-only'));assert.equal(events[1][1],VERIFY);assert.equal(events.length,2);
});
test('exact uncertain-proposal output blocks business continuation even when the job reports SUCCESS',async()=>{
 const v=await observe(VERIFY);assert.equal(v.status,'held');assert.equal(v.finding,'proposal-submission-uncertain');
 assert.equal(v.businessGatePassed,false);assert.equal(v.authorized,false);assert.equal(v.releaseReady,false);assert.equal(v.terminalAdmission,false);
});
for(const route of ['metadata-only','ref-refresh','ordinary'])test('whole '+route+' native terminal precedes one exact matched output',async()=>{
 entry();const f=await(route==='metadata-only'?metadataC1Fixture():route==='ref-refresh'?refreshFixture():rolloverProposalFixture()),{r,events}=await invoke(f);
 assert.equal(r.record.complete,true);assert.equal(r.report.route,route);assert.deepEqual(events.map(x=>x[0]),['summary','output']);assert.equal(events[1][1],MATCH);
 assert.equal(r.report.output.saved,true);assert.equal(r.report.proposeOutcome,'metadata-matched');assert.equal(r.report.releaseReady,false);
 const ids=r.record.snapshot.commitLog.map(x=>x.stageId);assert.ok(ids.indexOf('proposal-route-output')>ids.indexOf('proposal-route-terminal'));
 assert.equal(ids.filter(x=>x==='proposal-bootstrap-capture').length,1);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('whole stale idempotent metadata keeps its exact existing HOLD spelling',async()=>{
 entry();const f=await metadataC1Fixture({status:503,apply:false}),{r,events}=await invoke(f);
 assert.equal(r.status,'metadata-hold');assert.equal(events[1][1],STALE);assert.equal(r.report.proposeOutcome,'hold-metadata-stale');
});
for(const phase of ['objects','ref','pr-applied','pr-unapplied'])test('whole uncertain '+phase+' reports verify-only without false stale or match',async()=>{
 entry();const options=phase==='objects'?{effectStatus:503}:phase==='ref'?{refStatus:503}:{prStatus:503,prApply:phase==='pr-applied'};
 const f=await rolloverProposalFixture(options),{r,events}=await invoke(f);
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(events[1][1],VERIFY);assert.equal(r.report.proposeOutcome,'hold-proposal-uncertain');
 assert.equal((await observe(events[1][1])).businessGatePassed,false);assert.equal(r.report.releaseReady,false);
});
test('a technical known inconsistent native reply emits no successful HOLD or matched output',async()=>{
 entry();const f=await rolloverProposalFixture({prReplyChange:p=>{p.user.login='other[bot]';}}),{r,events}=await invoke(f);
 assert.equal(r.status,'technical-failure');assert.deepEqual(events,[]);assert.equal(r.report.output.saved,false);assert.equal(r.report.prSubmission,'returned');
});
test('invalid CODE output ports refuse before any provider mutation',async()=>{
 entry();const f=await rolloverProposalFixture(),{r}=await invoke(f,{appendOutput:null});
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.prCreates.length,0);
});
test('actual whole terminal cannot be replaced by claimed completion DATA',async()=>{
 const run=entry(),original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this);if(!s.commitLog.some(x=>x.stageId==='proposal-route-terminal'))return s;touched=true;
   return {...s,commitLog:s.commitLog.map(x=>x.stageId==='proposal-route-terminal'?{...x,stageId:'claimed-terminal'}:x)};
  };
  const f=await metadataC1Fixture(),events=[],r=await run({...f.makeInvocation(),completed:true,terminalAdmission:true,appendSummary:async()=>events.push('summary'),appendOutput:async()=>events.push('output')});
  assert.equal(touched,true);assert.equal(r.status,'technical-failure');assert.deepEqual(events,[]);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});
test('partial local output failure stays technical and preserves earlier native effects without retry',async()=>{
 entry();let summaries=0,outputs=0;const f=await rolloverProposalFixture(),{r}=await invoke(f,{
  appendSummary:async()=>{summaries++;},appendOutput:async()=>{outputs++;throw Error(PRIVATE);}
 });
 assert.equal(r.status,'technical-failure');assert.equal(summaries,1);assert.equal(outputs,1);assert.equal(f.prCreates.length,1);
 assert.equal(r.report.output.partialSavePossible,true);assert.equal(r.report.output.saved,false);assert.equal(r.record.complete,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
for(const uncertain of [false,true])test('actual local save/reopen '+(uncertain?'verify-only':'match')+' reaches the native business gate without authority',async()=>{
 entry();const f=await rolloverProposalFixture(uncertain?{prStatus:503,prApply:false}:{});
 const parent=process.env.OPS_PROOF_ROOT??os.tmpdir();fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'whole-output-')),out=path.join(root,'output'),summary=path.join(root,'summary');
 const r=await entry()({...f.makeInvocation(),appendSummary:async t=>fs.appendFileSync(summary,t),appendOutput:async t=>fs.appendFileSync(out,t)});
 fs.writeFileSync(path.join(root,'native-record.json'),JSON.stringify(r.record)+'\n');
 assert.equal(r.record.complete,true);const line=fs.readFileSync(out,'utf8');assert.equal(line,uncertain?VERIFY:MATCH);
 assert.ok(fs.readFileSync(summary,'utf8').length>0);assert.equal(JSON.parse(fs.readFileSync(path.join(root,'native-record.json'),'utf8')).complete,true);
 const gate=await observe(line);assert.equal(gate.businessGatePassed,!uncertain);assert.equal(gate.authorized,false);assert.equal(gate.terminalAdmission,false);
 assert.equal((await observe(line,'failure')).businessGatePassed,false);
});
test('whole native controller awaits the actual local output append',async()=>{
 const run=entry(),f=await metadataC1Fixture();let release,entered,settled=false;
 const wait=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const work=run({...f.makeInvocation(),appendSummary:async()=>{},appendOutput:async()=>{entered();await wait;}}).then(r=>{settled=true;return r;});
 await started;await new Promise(r=>setImmediate(r));let r;
 try{assert.equal(settled,false);}finally{release();r=await work;}
 assert.equal(r.status,'metadata-match');assert.equal(r.report.output.saved,true);
});
test('whole no-output CODE entry ignores supplied local output callbacks',async()=>{
 entry();const f=await metadataC1Fixture({exact:true});let calls=0;
 const r=await implementation.runFoottraceProposal({...f.makeInvocation(),appendSummary:()=>calls++,appendOutput:()=>calls++,outputFactory:()=>calls++});
 assert.equal(r.status,'metadata-match');assert.equal(calls,0);
});

for(const route of ['metadata-only','ref-refresh','ordinary'])test('saved whole output links '+route+' domain terminal through native value reads',async()=>{
 entry();const f=await(route==='metadata-only'?metadataC1Fixture():route==='ref-refresh'?refreshFixture():rolloverProposalFixture()),{r}=await invoke(f);assert.equal(r.record.complete,true);
 const visit=(v,id)=>{if(!v||typeof v!=='object')return null;if(v.id===id)return v;for(const c of Object.values(v)){const x=visit(c,id);if(x)return x;}return null;};
 const terminal=visit(r.record.snapshot.executionTree,'proposal-route-terminal'),output=visit(r.record.snapshot.executionTree,'proposal-route-output');
 assert.ok(terminal);assert.ok(output);
 const key=route==='metadata-only'?'metadataC1Result':route==='ref-refresh'?'pendingRefreshResult':'rolloverPrResult';
 assert.equal(terminal.stageReads?.[key]?.authorized,false,'whole terminal must read its actual selected domain result');
 assert.equal(terminal.stageReads[key].releaseReady,false);
 assert.equal(output.stageReads?.proposalRouteResult?.outcome,'metadata-match');
});

for(const route of ['metadata-only','ref-refresh','ordinary'])test('closed output report refuses altered '+route+' native terminal facts',async()=>{
 entry();const f=await(route==='metadata-only'?metadataC1Fixture():route==='ref-refresh'?refreshFixture():rolloverProposalFixture()),{r}=await invoke(f);
 assert.equal(r.record.complete,true);
 const key=route==='metadata-only'?'metadataC1Result':route==='ref-refresh'?'pendingRefreshResult':'rolloverPrResult',v=structuredClone(r.record.snapshot.sharedState[key]);
 if(route==='metadata-only')v.verified=false;if(route==='ref-refresh')v.metadataVerified=false;if(route==='ordinary')v.prObserved=false;
 assert.throws(()=>wholeProposalTerminalOutcome(route,r.status,v));assert.throws(()=>wholeProposalTerminalOutcome(route,'technical-failure',v));
});
test('missing actual native output commit cannot be promoted by a successful append',async()=>{
 const run=entry(),original=FlowChartExecutor.prototype.getSnapshot;let touched=false;
 try{
  FlowChartExecutor.prototype.getSnapshot=function(){
   const s=original.call(this);if(!s.commitLog.some(x=>x.stageId==='proposal-route-output'))return s;touched=true;
   return {...s,commitLog:s.commitLog.map(x=>x.stageId==='proposal-route-output'?{...x,stageId:'claimed-output'}:x)};
  };
  const f=await metadataC1Fixture(),{r,events}=await invoke(f);
  assert.equal(touched,true);assert.equal(events.length,2);assert.equal(r.report.output.saved,true);assert.equal(r.status,'technical-failure');assert.equal(r.record.complete,false);
 }finally{FlowChartExecutor.prototype.getSnapshot=original;}
});

for(const uncertainRef of [false,true])test('whole pending output distinguishes '+(uncertainRef?'uncertain ref from stale metadata':'verified stale metadata after acknowledged ref'),async()=>{
 entry();const f=await refreshFixture(uncertainRef?{refStatus:503}:{metadataStatus:503,metadataApply:false}),{r,events}=await invoke(f);
 assert.equal(r.record.complete,true);assert.equal(r.status,uncertainRef?'refresh-verify-only':'metadata-hold');
 assert.equal(events[1][1],uncertainRef?VERIFY:STALE);assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,uncertainRef?0:1);
 const gate=await observe(events[1][1]);assert.equal(gate.businessGatePassed,false);
 assert.equal(gate.finding,uncertainRef?'proposal-submission-uncertain':'metadata-stale');
 assert.equal(r.report.releaseReady,false);assert.equal(r.report.authorized,false);
});
