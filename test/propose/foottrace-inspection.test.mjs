import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoottraceProposeInspection} from '../../src/propose/foottrace-inspection.mjs';
import {bootstrapFixture,PRIVATE} from './bootstrap-provider-fixture.mjs';
const run=(f,extra={})=>runFoottraceProposeInspection({transport:f.transport,context:f.fullContext,artifactId:800,...extra});
test('one production native chart discovers all inputs then joins actual source/history/App/current archive with no seeded facts',async()=>{
 const f=await bootstrapFixture(),r=await run(f);assert.equal(r.status,'inspection-only');assert.equal(r.record.complete,true);assert.equal(r.report.retainedAttemptsEligible,false);assert.equal(r.record.snapshot.sharedState.proposeInspectionFacts.retainedAttemptsReason,'retained-native-history-incomplete');
 assert.equal(r.backend.prepared.sourceSha,f.M);assert.equal(r.backend.prepared.pendingSha,f.P);assert.equal(r.backend.prepared.predecessor.merge,f.f.originalMerge);
 assert.equal(r.backend.currentProposer.identity.runId,500);assert.equal(r.backend.currentPreparation.reference.artifactId,800);
 assert.equal(r.report.authorized,false);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(r.report.executedWrites,0);
 const text=JSON.stringify(r.record);assert.match(text,/propose-bootstrap-lineage/);assert.match(text,/propose-inspection-inputs/);assert.match(text,/propose-inspection-current-preparation/);
 assert.equal(text.includes(PRIVATE),false);assert.equal(text.includes('A new fixture fragment'),false);assert.equal(text.includes('offline_registry_token'),false);
 assert.ok(f.calls.every(p=>typeof p==='string'));
});
test('a completed current invocation cannot be promoted from historical preparation or saved bootstrap facts',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.authorized,false);
});
test('an actual current archive substitution holds after native input discovery',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/actions/artifacts/800'))d.workflow_run.head_sha='f'.repeat(40);}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
});
test('all native preparation evidence is discarded when the single final record is incomplete',async()=>{
 const f=await bootstrapFixture(),r=await run(f,{recordLimitBytes:256});assert.equal(r.status,'incomplete');assert.equal(r.backend===null,true);assert.equal(r.report.authorized,false);
});

const facts=r=>r.record.snapshot?.sharedState?.proposeInspectionFacts;
test('full invocation context is admitted before any discovery HTTP request',async()=>{
 for(const edit of [c=>{c.runId='500';},c=>{c.runAttempt=9;},c=>{c.eventName='pull_request';},c=>{c.ref='refs/heads/other';}]){
  const f=await bootstrapFixture(),context=structuredClone(f.fullContext);edit(context);
  const r=await run(f,{context});assert.equal(r.status,'held');assert.equal(f.calls.length,0);
 }
});
test('runtime transport brand and artifact identifier cannot be supplied by JSON facts',async()=>{
 const f=await bootstrapFixture();
 for(const extra of [{transport:{readOnly:true}},{artifactId:'800'}]){
  const r=await run(f,extra);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 }
 assert.equal(f.calls.length,0);
});
test('workflow collection drift after bootstrap holds before current identity or archive acquisition',async()=>{
 let collections=0;
 const f=await bootstrapFixture({change:(d,p)=>{
  if(p.includes('/actions/workflows/11/runs'))collections++;
  if(collections>=5&&p.includes('/actions/runs/10/attempts/1/jobs'))d.jobs[0].conclusion='failure';
 }}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(facts(r).workflowReason,'retained-workflow-discovery-drift');
 assert.equal(f.calls.some(p=>p.endsWith('/actions/runs/500')),false);
 assert.equal(f.calls.some(p=>p.endsWith('/actions/artifacts/800/zip')),false);
});
test('a different but internally stable App identity cannot replace the immediately prior native identity',async()=>{
 let appReads=0;
 const f=await bootstrapFixture({changeHttp:(response,url)=>{
  if(new URL(url).pathname==='/app'&&++appReads>=3)
   return Response.json({id:701,slug:'release-app',client_id:'public-client-id'});
 }}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(facts(r).proposerIdentity,true);assert.equal(facts(r).currentPreparation,false);
 assert.equal(f.calls.some(p=>p.endsWith('/actions/artifacts/800/zip')),false);
});
test('immutable retained package blob substitution holds before current identity acquisition',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.includes('/contents/package.json?ref='))d.sha='e'.repeat(40);}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(facts(r).sourceVersions,false);
 assert.equal(f.calls.some(p=>p.endsWith('/actions/runs/500')),false);
});
test('a current archive from a different successful prepare job cannot be joined',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(new URL('https://offline.invalid'+p).pathname.endsWith('/attempts/1/jobs')&&p.includes('/runs/500/'))d.jobs.find(j=>j.name==='prepare').id=601;}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(facts(r).currentPreparation,false);
});
test('published predecessor belongs to its actual terminal publisher independently of the running M invocation',async()=>{
 const f=await bootstrapFixture(),marker=JSON.parse([...f.f.releases.values()][0].assets[0].raw);
 const publisher=f.cohorts.find(c=>c.run.id===marker.runId),current=f.cohorts.find(c=>c.run.id===500);
 assert.ok(publisher);assert.equal(publisher.run.head_sha,marker.sha);assert.equal(publisher.run.head_sha,f.f.originalMerge);
 assert.equal(publisher.run.status,'completed');assert.equal(current.run.head_sha,f.M);assert.notEqual(publisher.run.id,current.run.id);
 const r=await run(f);assert.equal(r.status,'inspection-only');assert.equal(r.report.retainedAttemptsEligible,false);assert.equal(r.record.snapshot.sharedState.proposeInspectionFacts.retainedAttemptsReason,'retained-native-history-incomplete');
});
