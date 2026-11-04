import test from 'node:test';
import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import {runFoottraceMetadataInputInspection} from '../../src/propose/foottrace-metadata-inputs.mjs';
import {runFoottraceInputBootstrap} from '../../src/propose/foottrace-input-bootstrap.mjs';
import {bootstrapFixture} from './bootstrap-provider-fixture.mjs';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
const run=(f,extra={})=>runFoottraceMetadataInputInspection({transport:f.transport,context:f.fullContext,artifactId:800,...extra});
test('one production native chart acquires current M/current archive/L/single signed P without selecting a historical creator',async()=>{
 const f=await metadataInputFixture(),r=await run(f);
 assert.equal(r.status,'metadata-inputs-only');assert.equal(r.record.complete,true);
 assert.equal(r.backend.prepared.sourceSha,f.M);assert.equal(r.backend.prepared.targetTree,r.backend.pending.reference.tree);
 assert.equal(r.backend.current.identity.runId,500);assert.equal(r.backend.archive.reference.artifactId,800);
 assert.equal(r.backend.lineage.predecessor.merge,f.f.originalMerge);assert.equal(r.backend.observedCommit.reference.head,f.head);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.report.originalProducerAttributed,false);
 assert.equal(r.report.writerCredentialBindingAdmitted,false);assert.equal(r.report.retainedEligibilityAdmitted,false);
 const text=JSON.stringify(r.record);assert.match(text,/metadata-current-inputs/);assert.match(text,/propose-observed-app-commit-decision/);
 assert.equal(text.includes(PRIVATE),false);assert.equal(text.includes('A new fixture fragment'),false);
 assert.equal(f.calls.some(p=>p.includes('/actions/workflows/')||p.includes('/actions/artifacts/900')),false);
});
test('duplicate old preparation cohorts do not block metadata input knowledge but still hold the separate ref-refresh bootstrap',async()=>{
 const f=await metadataInputFixture({duplicate:true}),r=await run(f);assert.equal(r.status,'metadata-inputs-only');
 const old=await bootstrapFixture({duplicate:true}),legacy=await runFoottraceInputBootstrap({transport:old.transport,context:old.context});
 assert.equal(legacy.status,'held');assert.equal(legacy.report.reason,'preparation-candidate-ambiguous');
});
test('different target tree stops before resolved commit identity reads and grants no metadata route',async()=>{
 const f=await metadataInputFixture({sameTree:false}),r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 assert.equal(r.report.reason,'metadata-target-mismatch');
 assert.equal(f.calls.some(p=>p==='/repos/footprintjs/foottrace/commits/'+f.head),false);
});
test('a completed current producer cannot borrow successful historic preparation to enter the metadata input path',async()=>{
 const f=await metadataInputFixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.some(p=>p.includes('/actions/artifacts/800/zip')),false);
});
test('substituted current archive is held before publication lineage or pending PR reads',async()=>{
 const f=await metadataInputFixture({change:(d,p)=>{if(p.endsWith('/actions/artifacts/800'))d.workflow_run.head_sha='f'.repeat(40);}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.some(p=>p.includes('/releases')),false);
});
test('unsigned or foreign resolved App state remains a metadata input hold',async()=>{
 for(const changeCommit of [d=>{d.commit.verification.verified=false;},d=>{d.committer.id++;}]){
  const f=await metadataInputFixture({changeCommit}),r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
  assert.equal(r.report.authorized,false);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
});
test('incomplete single native recording discards all acquired current/predecessor/ref data',async()=>{
 const f=await metadataInputFixture(),r=await run(f,{recordLimitBytes:256});assert.equal(r.status,'incomplete');assert.equal(r.backend===null,true);
});
test('invalid actual invocation facts stop before any native discovery read',async()=>{
 const f=await metadataInputFixture(),r=await run(f,{context:{...f.fullContext,runId:'500'}});
 assert.equal(r.status,'held');assert.equal(f.calls.length,0);
});

test('a moved pending ref after the last signed commit snapshot cannot remain current metadata input knowledge',async()=>{
 let f;f=await metadataInputFixture({changeCommit:(d,n)=>{if(n===2){f.f.tip=f.P;f.pending.head.sha=f.P;}}});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 assert.equal(r.report.reason,'metadata-pending-observation-drift');
});

test('same-tree current preparation can bind a real older parent source without attributing any old preparation cohort',async()=>{
 const f=await metadataInputFixture({extend:'empty',useOriginalHead:true,duplicate:true}),r=await run(f);
 assert.notEqual(f.B,f.M);assert.equal(r.status,'metadata-inputs-only');
 assert.equal(r.backend.parentSource.reference.sourceSha,f.B);
 assert.equal(r.backend.parentSource.reference.currentSourceSha,f.M);assert.equal(r.report.originalProducerAttributed,false);
});
test('raw old-parent queue edits remain a hold even when normalization leaves the exact current target tree unchanged',async()=>{
 const f=await metadataInputFixture({extend:'empty',useOriginalHead:true,changeCurrent:inventory=>{
  const old=inventory.get('.changes/helper-fix.md'),bytes=Buffer.concat([old.bytes,Buffer.from('\n')]);
  inventory.set('.changes/helper-fix.md',{bytes,mode:old.mode,sha:preparation.gitObject('blob',bytes)});
 }}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-parent-source-unavailable');assert.equal(r.backend===null,true);
});

test('an App ref with the current target but a parent whose actual preparation differs is not trusted as metadata source',async()=>{
 const f=await metadataInputFixture({pendingParent:'original'}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-parent-source-unavailable');assert.equal(r.backend===null,true);
 assert.equal(f.calls.some(p=>p==='/repos/footprintjs/foottrace/commits/'+f.head),false);
});
test('actual predecessor-to-parent ancestry cannot be inferred from a matching current target',async()=>{
 let f;f=await metadataInputFixture({extend:'empty',useOriginalHead:true,change:(d,p)=>{
  if(p.includes('/compare/')&&p.includes('...'+f.B+'?')){d.status='diverged';d.behind_by=1;}
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-parent-source-unavailable');
});
test('older parent-to-current ancestry remains independently mandatory',async()=>{
 let f;f=await metadataInputFixture({extend:'empty',useOriginalHead:true,change:(d,p)=>{
  if(p.includes('/compare/'+f.B+'...'+f.M+'?')){d.status='diverged';d.behind_by=1;}
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'metadata-parent-source-unavailable');
});

test('current artifact ID and opaque transport cannot be replaced with saved JSON facts',async()=>{
 const f=await metadataInputFixture();
 for(const extra of [{artifactId:'800'},{transport:{readOnly:true}}]){
  const r=await run(f,extra);assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.length,0);
 }
});
test('a final source-head conflict cannot be cleared by a valid signed existing proposal',async()=>{
 let f;f=await metadataInputFixture({changeCommit:(d,n)=>{if(n===2)f.f.advance(()=>{});}});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.authorized,false);
});
