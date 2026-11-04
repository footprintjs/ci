import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoottraceMetadataInputInspection} from '../../src/propose/foottrace-metadata-inputs.mjs';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
const run=f=>runFoottraceMetadataInputInspection({transport:f.transport,context:f.fullContext,artifactId:800});
test('current metadata includes actual adjacent native reviews without inventing old preparationRefs',async()=>{
 const f=await metadataInputFixture({reviewStates:['COMMENTED'],duplicate:true}),r=await run(f);
 assert.equal(r.status,'metadata-inputs-only');assert.equal(r.backend.reviews?.valid,true);
 assert.equal(r.backend.reviews.reviewCount,1);assert.equal(r.report.metadataReviewsObserved,true);
 assert.equal(r.report.retainedEligibilityAdmitted,false);assert.equal(r.report.authorized,false);
 assert.equal(r.backend.prepared.preparationRefs,undefined);
 const record=JSON.stringify(r.record);assert.match(record,/metadata-review-decision/);assert.equal(record.includes(PRIVATE),false);
});
for(const [state,reason] of [['APPROVED','effective-approval'],['CHANGES_REQUESTED','effective-refusal'],['PENDING','pending-review']])
 test('metadata input stops on '+state+' before reading signed App state',async()=>{
  const f=await metadataInputFixture({reviewStates:[state]}),r=await run(f);
  assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.reason,reason);
  assert.equal(f.calls.some(p=>p==='/repos/footprintjs/foottrace/commits/'+f.head),false);
 });
test('permission changes and failed review acquisition are finite metadata holds',async()=>{
 for(const changeReview of [
  (d,p,n)=>{if(p.includes('/collaborators/')&&n.permissionReads===2)d.permission='read';},
  (d,p)=>{if(p.includes('/reviews?'))throw new Error(PRIVATE);}
 ]){
  const f=await metadataInputFixture({reviewStates:['COMMENTED'],changeReview}),r=await run(f);
  assert.equal(r.status,'held');assert.equal(r.backend===null,true);
  assert.equal(r.report.reason,'review-evidence-unavailable');assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
});
test('a new approval or comment after signed reads invalidates earlier metadata review knowledge',async()=>{
 for(const state of ['APPROVED','COMMENTED']){
  let f;f=await metadataInputFixture({changeCommit:(d,n)=>{if(n===2)f.addReview(state);}});
  const r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
  assert.equal(r.report.reason,state==='APPROVED'?'effective-approval':'metadata-review-observation-drift');
 }
});
test('bad pending target never performs review or identity acquisition',async()=>{
 const f=await metadataInputFixture({sameTree:false,reviewStates:['COMMENTED']}),r=await run(f);
 assert.equal(r.status,'held');assert.equal(f.calls.some(p=>p.includes('/reviews?')),false);
});

test('stable post-signature permissions must equal the earlier native permission fingerprint',async()=>{
 const f=await metadataInputFixture({reviewStates:['COMMENTED'],changeReview:(d,p,n)=>{
  if(p.includes('/collaborators/')&&n.permissionReads>2)d.permission='maintain';
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 assert.equal(r.report.reason,'metadata-review-observation-drift');
});
test('a pending-ref movement during the last review acquisition cannot expose metadata knowledge',async()=>{
 let f;f=await metadataInputFixture({changeReview:(d,p,n)=>{
  if(p.includes('/reviews?')&&n.reviewReads===4){f.f.tip=f.P;f.pending.head.sha=f.P;}
 }});
 const r=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 assert.equal(r.report.authorized,false);
});
