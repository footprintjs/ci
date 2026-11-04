import test from 'node:test';
import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import {runFoottraceInputBootstrap} from '../../src/propose/foottrace-input-bootstrap.mjs';
import {bootstrapFixture,PRIVATE} from './bootstrap-provider-fixture.mjs';
const run=f=>runFoottraceInputBootstrap({transport:f.transport,context:f.context});
test('one coherent native HTTP world discovers actual published L, pending P, retained B archive and current M preparation without seeded witnesses',async()=>{
 const f=await bootstrapFixture(),r=await run(f);assert.equal(r.status,'bootstrap-inputs-only');assert.equal(r.record.complete,true);
 assert.equal(r.backend.prepared.sourceSha,f.M);assert.equal(r.backend.prepared.pendingSha,f.P);assert.equal(r.backend.prepared.predecessor.head,f.f.originalHead);
 assert.equal(r.backend.prepared.version,'1.11.0');assert.notEqual(f.B,f.M);assert.equal(r.backend.inputs.pending.witnesses[0].originalSource.commit.sha,f.B);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.report.privateAppIdentityAdmitted,false);
 const text=JSON.stringify(r.record);assert.equal(text.includes(PRIVATE),false);assert.equal(text.includes('A new fixture fragment'),false);assert.match(text,/propose-bootstrap/);
});
test('ambiguous original native cohorts hold the coherent bootstrap',async()=>{
 const r=await run(await bootstrapFixture({duplicate:true}));assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.reason,'preparation-candidate-ambiguous');
});
test('a substituted original artifact remains a saved finite hold',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/actions/artifacts/900'))d.workflow_run.head_sha='f'.repeat(40);}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
});
test('an incomplete native bootstrap recording discards otherwise reconstructed inputs',async()=>{
 const f=await bootstrapFixture(),r=await runFoottraceInputBootstrap({transport:f.transport,context:f.context,recordLimitBytes:256});
 assert.equal(r.status,'incomplete');assert.equal(r.record.complete,false);assert.equal(r.backend===null,true);
});
test('saved JSON cannot substitute the opaque native transport',async()=>{
 const f=await bootstrapFixture(),r=await runFoottraceInputBootstrap({transport:{readOnly:true},context:f.context});
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.authorized,false);
});

test('removed original raw fragment cannot disappear behind a valid current minor preparation',async()=>{
 const f=await bootstrapFixture({changeCurrent:inventory=>inventory.delete('.changes/helper-fix.md')}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.reason,'bootstrap-preparation-unavailable');
});
test('semantically equivalent edited original fragment is still a raw-queue conflict',async()=>{
 const f=await bootstrapFixture({changeCurrent:inventory=>{const old=inventory.get('.changes/helper-fix.md'),bytes=Buffer.concat([old.bytes,Buffer.from('\n')]);
  inventory.set('.changes/helper-fix.md',{bytes,mode:old.mode,sha:preparation.gitObject('blob',bytes)});}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.reason,'bootstrap-preparation-unavailable');
});
test('a final pending-ref conflict stops before another workflow acquisition',async()=>{
 let details=0;const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/pulls/101')&&++details===3)d.head.sha='f'.repeat(40);}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'bootstrap-observation-drift');assert.equal(r.backend===null,true);
 assert.equal(f.calls.filter(p=>p.includes('/actions/workflows/11/runs?')).length,2);
});
test('a later coherent retained-job outcome cannot replace the initial discovery collection',async()=>{
 let listings=0;const f=await bootstrapFixture({change:(d,p)=>{
  if(p.includes('/actions/workflows/11/runs?')){listings++;if(listings>=3){const current=d.workflow_runs.find(r=>r.id===500);current.status='completed';current.conclusion='failure';}}
  if(listings>=3&&p.endsWith('/actions/runs/500/attempts/1')){d.status='completed';d.conclusion='failure';}
  if(listings>=3&&p.includes('/actions/runs/500/attempts/1/jobs?'))for(const j of d.jobs){if(j.status==='in_progress'){j.status='completed';j.conclusion='failure';}else if(j.status==='queued'){j.status='completed';j.conclusion='skipped';}}
 }}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.report.reason,'bootstrap-observation-drift');assert.equal(r.backend===null,true);assert.equal(listings,4);
});
test('expired historical input bytes hold without an archive download',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.includes('/actions/runs/456/artifacts?'))d.artifacts[0].expired=true;}}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.filter(p=>p.endsWith('/zip')).length,0);
});
test('a different repository context never reuses the opaque transport identity',async()=>{
 const f=await bootstrapFixture(),r=await runFoottraceInputBootstrap({transport:f.transport,context:{...f.context,repository:{id:999,full_name:'footprintjs/foottrace'}}});
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.length,0);
});
test('unowned private provider metadata changes neither native input refs nor their receipt',async()=>{
 const a=await run(await bootstrapFixture()),b=await run(await bootstrapFixture({change:d=>{if(!Buffer.isBuffer(d)&&d&&typeof d==='object')d.private='DIFFERENT-PRIVATE-BOOTSTRAP';}}));
 assert.equal(a.status,'bootstrap-inputs-only');assert.equal(b.status,'bootstrap-inputs-only');assert.equal(a.report.receiptRef,b.report.receiptRef);
 assert.equal(JSON.stringify(a.record).includes(PRIVATE),false);assert.equal(JSON.stringify(b.record).includes('DIFFERENT-PRIVATE-BOOTSTRAP'),false);
});
