import {containsRecordText} from './record-text-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
async function run(f,extra={}){
 const module=await import('../../src/propose/foottrace-metadata-history.mjs').catch(()=>({}));
 assert.equal(typeof module.runFoottraceMetadataHistoryInspection,'function');
 return module.runFoottraceMetadataHistoryInspection({transport:f.transport,context:f.fullContext,artifactId:800,...extra});
}
test('current-only metadata joins actual retained native workflows, source versions and candidate observations in ONE chart',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),r=await run(f);
 assert.equal(r.status,'metadata-history-only');assert.equal(r.record.complete,true);
 assert.equal(r.backend.prepared.preparationRefs,undefined);assert.equal(r.backend.attempts.eligible,true);
 assert.equal(r.backend.attempts.current.runId,500);
 const marker=JSON.parse([...f.f.releases.values()][0].assets[0].raw);assert.equal(r.backend.lineage.producer.runId,marker.runId);assert.equal(r.backend.lineage.producer.runAttempt,marker.runAttempt);assert.equal(r.backend.workflows.runs.length,3);
 assert.deepEqual([...r.backend.versions.versions],[r.backend.prepared.version]);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.report.retainedEligibilityAdmitted,false);
 assert.equal(r.report.providerContinuityProved,false);assert.equal(r.report.writerCredentialBindingAdmitted,false);
 const text=JSON.stringify(r.record);assert.match(text,/metadata-current-inputs/);assert.match(text,/propose-observed-app-commit/);assert.match(text,/metadata-history-final-decision/);assert.equal(text.includes(PRIVATE),false);
});
test('incomplete older preparation-only history is data, never eligible effect history',async()=>{
 const f=await metadataInputFixture(),r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 assert.equal(r.report.reason,'retained-native-history-incomplete');
});
for(const [label,change,reason] of [
 ['failed old proposal',(d,p)=>{if(p.includes('/runs/456/')&&d.jobs)d.jobs.find(j=>j.name==='proposal').conclusion='failure';},'retained-native-proposal-uncertain'],
 ['running old invocation',(d,p)=>{if(d.workflow_runs)for(const x of d.workflow_runs)if(x.id===456){x.status='in_progress';x.conclusion=null;}if(p.endsWith('/runs/456/attempts/1')){d.status='in_progress';d.conclusion=null;}},'retained-native-nonterminal'],
 ['old base-source publication',(d,p)=>{if(p.includes('/runs/456/')&&d.jobs)d.jobs.find(j=>j.name==='publish').conclusion='success';},'retained-native-effect-or-submission'],
 ['current started publish',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs){const j=d.jobs.find(j=>j.name==='publish');j.status='in_progress';j.conclusion=null;}},'current-native-stage-conflict']
])test(label+' cannot become effect eligibility from same-tree metadata',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native',change}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.reason,reason);
});
test('native candidate marker reservation is observed and prevents the history path completing',async()=>{
 let f;f=await metadataInputFixture({retainedJobs:'full-native',change:(d,p)=>{
  if(p.includes('/assets?')&&!d.some(x=>x.id===7654321))d.push({id:7654321,name:'publish-attempt-'+f.currentPrepared.version+'.json',state:'uploaded',size:12});
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'candidate-reservation-or-publication');assert.equal(r.backend===null,true);
});
test('a missing retained workflow read or immutable package blob cannot be replaced by an empty history',async()=>{
 for(const change of [
  (d,p)=>{if(p.includes('/actions/workflows/11/runs'))throw new Error(PRIVATE);},
  (d,p)=>{if(p.includes('/contents/package.json?ref='))d.sha='f'.repeat(40);}
 ]){
  const f=await metadataInputFixture({retainedJobs:'full-native',change}),r=await run(f);
  assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
});
test('one incomplete native record discards acquired history as well as current inputs',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),r=await run(f,{recordLimitBytes:256});
 assert.equal(r.status,'incomplete');assert.equal(r.backend===null,true);
});
test('history entry accepts no modelled readers or JSON transport authority',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),r=await run(f,{transport:{readOnly:true}});
 assert.equal(r.status,'held');assert.equal(f.calls.length,0);assert.equal(r.backend===null,true);
});

test('duplicate fully observed terminal prepares never become historical creator attribution',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native',duplicate:true}),r=await run(f);
 assert.equal(r.status,'metadata-history-only');assert.equal(r.backend.attempts.retainedAttempts,3);
 assert.equal(r.backend.observedCommit.reference.head,f.head);assert.equal(r.backend.prepared.originalProducerAttributed,false);
});
test('a later complete native history collection changing one old job invalidates earlier classification',async()=>{
 let phases=0;
 const f=await metadataInputFixture({retainedJobs:'full-native',change:(d,p)=>{
  if(p.includes('/actions/workflows/11/runs'))phases++;
  if(phases>=3&&p.includes('/runs/456/')&&d.jobs)d.jobs.find(x=>x.name==='plan').conclusion='neutral';
 }}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'retained-workflow-discovery-drift');
 assert.equal(r.backend===null,true);
});
test('final pending state cannot drift after history and candidate observations',async()=>{
 let f;f=await metadataInputFixture({retainedJobs:'full-native',changeCommit:(d,n)=>{
  if(n===3){f.f.tip=f.P;f.pending.head.sha=f.P;}
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-current-observation-drift');assert.equal(r.backend===null,true);
});

test('actual native current preparation supplies desired metadata in the SAME history chart',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),r=await run(f);
 assert.equal(r.status,'metadata-history-only');assert.equal(r.backend.metadata?.valid,true);
 assert.equal(r.backend.metadata.observation.matches,true);
 assert.equal(r.record.snapshot.sharedState.metadataHistoryResult.metadata,true);
 assert.match(JSON.stringify(r.record),/metadata-history-read-metadata/);
 assert.equal(containsRecordText(r.record,r.backend.metadata.payload.body),false);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
});
test('stale native metadata is known input, not a held read or a PATCH grant',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native',metadata:'stale'}),r=await run(f);
 assert.equal(r.status,'metadata-history-only');assert.equal(r.backend.metadata?.valid,true);
 assert.equal(r.backend.metadata.observation.matches,false);assert.equal(r.record.snapshot.sharedState.metadataHistoryResult.metadataMatches,false);assert.equal(r.report.authorized,false);
 assert.equal(r.report.executedWrites,0);
});

test('malformed actual PR metadata holds after native history without erasing its attempt classification',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native',metadata:{title:null,body:'unknown'}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'computed-metadata-unavailable');
 assert.equal(r.report.retainedAttemptsEligible,true);assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
});
test('later metadata drift after native history and signed-state recheck invalidates the computed join',async()=>{
 let f;f=await metadataInputFixture({retainedJobs:'full-native',changeMetadata:d=>{
  if(f.calls.filter(x=>x.includes('/actions/workflows/11/runs')).length>=4)d.body+='later drift';
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-observation-drift');
 assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
});
