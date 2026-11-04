import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {rolloverProposalFixture} from './rollover-proposal-provider-fixture.mjs';
import {createProposalBusinessGate} from '../../src/propose/proposal-business-gate.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const require=createRequire(import.meta.url),bundle=path.resolve('dist/propose-writer.cjs');
function bytes(){let value;try{value=fs.readFileSync(bundle);}catch{}assert.ok(value,'actual prebuilt native writer program absent');return value;}
async function physical(esm=false){
 const data=bytes(),parent=process.env.OPS_PROOF_ROOT??os.tmpdir();fs.mkdirSync(parent,{recursive:true});
 const root=fs.mkdtempSync(path.join(parent,'writer-physical-')),file=path.join(root,'propose-writer.cjs');fs.writeFileSync(file,data);
 assert.equal(fs.existsSync(path.join(root,'node_modules')),false);
 const module=esm?(await import(pathToFileURL(file).href)).default:require(file);
 assert.deepEqual(Object.keys(module),['runFoottraceProposalWithOutput']);assert.equal(typeof module.runFoottraceProposalWithOutput,'function');
 return {root,run:module.runFoottraceProposalWithOutput};
}
async function gate(output,conclusion='success'){
 const stage=createProposalBusinessGate({readOutput:()=>({output,conclusion})}),r=await runNativeObservationRecord({chart:stage.chart});
 assert.equal(r.record.complete,true);return stage.getObservation();
}
async function local(host,f,extra={}){
 const out=path.join(host.root,'output'),summary=path.join(host.root,'summary');
 const input=f.makeInvocation(),r=await host.run({...input,appendSummary:async t=>fs.appendFileSync(summary,t),appendOutput:async t=>fs.appendFileSync(out,t),...extra});
 fs.writeFileSync(path.join(host.root,'native-record.json'),JSON.stringify(r.record)+'\n');
 assert.equal('GH_TOKEN' in input.env,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 return {r,line:fs.existsSync(out)?fs.readFileSync(out,'utf8'):null};
}
test('physical writer metadata binds exact bytes, the same native recipes and Node-only imports',()=>{
 const data=bytes(),m=JSON.parse(fs.readFileSync('dist/propose-writer-metadata.json','utf8'));
 assert.equal(m.sha256,createHash('sha256').update(data).digest('hex'));assert.equal(m.purpose,'native-proposal-writer');
 assert.equal(m.writerAuthority,false);assert.equal(m.releaseReady,false);assert.equal(m.format,'cjs');assert.equal(m.target,'node22');
 for(const name of ['writer-program.mjs','foottrace-proposal.mjs','metadata-c1-flow.mjs','pending-refresh-flow.mjs','rollover-proposal-flow.mjs'])
  assert.ok(m.inputs.some(x=>x.path==='src/propose/'+name),name);
 assert.ok(m.inputs.some(x=>x.path.startsWith('node_modules/footprintjs/')));assert.ok(m.inputs.some(x=>x.path.startsWith('node_modules/foottrace/')));
 assert.ok(m.external.length>0);assert.ok(m.external.every(x=>x.startsWith('node:')));
});
for(const esm of [false,true])test('physical '+(esm?'ESM ordinary':'CJS C1')+' writer saves and reopens one native matched business output',async()=>{
 const h=await physical(esm),f=await(esm?rolloverProposalFixture():metadataC1Fixture()),{r,line}=await local(h,f);
 assert.equal(r.record.complete,true);assert.equal(line,'proposeOutcome=metadata-matched\n');assert.equal(r.report.output.saved,true);
 assert.equal(r.record.snapshot.commitLog.filter(x=>x.stageId==='proposal-bootstrap-capture').length,1);
 const g=await gate(line);assert.equal(g.businessGatePassed,true);assert.equal(g.authorized,false);assert.equal(g.terminalAdmission,false);
 assert.equal((await gate(line,'failure')).businessGatePassed,false);assert.equal(r.report.releaseReady,false);assert.equal(r.report.productionAdopted,false);
});
test('physical pending writer preserves verified stale metadata as a negative business output',async()=>{
 const h=await physical(),f=await refreshFixture({metadataStatus:503,metadataApply:false}),{r,line}=await local(h,f);
 assert.equal(r.status,'metadata-hold');assert.equal(line,'proposeOutcome=hold-metadata-stale\n');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);
 assert.equal((await gate(line)).finding,'metadata-stale');assert.equal((await gate(line)).businessGatePassed,false);
});
test('physical ordinary writer keeps uncertain create PR GET-only after actual local save/reopen',async()=>{
 const h=await physical(),f=await rolloverProposalFixture({prStatus:503,prApply:true}),{r,line}=await local(h,f);
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(f.prCreates.length,1);assert.equal(r.report.prSubmission,'uncertain');
 assert.equal(line,'proposeOutcome=hold-proposal-uncertain\n');assert.equal((await gate(line)).finding,'proposal-submission-uncertain');
 assert.equal((await gate(line)).businessGatePassed,false);assert.equal(r.report.releaseReady,false);
});
test('physical writer missing output port refuses before provider mutation',async()=>{
 const h=await physical(),f=await metadataC1Fixture(),{r,line}=await local(h,f,{appendOutput:null});
 assert.equal(r.status,'technical-failure');assert.equal(line,null);assert.equal(f.patches.length,0);
});
test('physical writer foreign actual current job cannot gain output or mutation permission',async()=>{
 const h=await physical(),f=await metadataC1Fixture({changeEnv:e=>{e.GITHUB_JOB='other';}}),{r,line}=await local(h,f);
 assert.equal(r.status,'technical-failure');assert.equal(line,null);assert.equal(f.patches.length,0);assert.equal(r.report.releaseReady,false);
});
test('physical writer saved line cannot promote a record-budget technical failure',async()=>{
 const h=await physical(),f=await metadataC1Fixture(),{r,line}=await local(h,f,{recordLimitBytes:256});
 assert.equal(r.record.complete,false);assert.equal(r.status,'technical-failure');assert.equal(r.report.releaseReady,false);
 assert.equal(line,'proposeOutcome=metadata-matched\n');assert.equal(r.report.output.saved,true);
 assert.equal((await gate(line,'failure')).businessGatePassed,false);
});
