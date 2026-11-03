import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateVersions,createCandidatePublicationReader} from '../../src/propose/candidate-publication.mjs';
import {fixture} from './candidate-provider-fixture.mjs';
import {createCurrentPreparedInputReader} from '../../src/propose/current-prepared-inputs.mjs';
import {createFoottracePreparationProfile} from '../../src/propose/foottrace-profile.mjs';
import {sourceFixture} from './prepared-fixtures.mjs';
import {retainedAttemptFixture} from './retained-attempt-provider-fixture.mjs';
import {createRetainedAttemptAssessor} from '../../src/propose/retained-attempts.mjs';
function current(){
 const r=createCurrentPreparedInputReader(createFoottracePreparationProfile())({source:sourceFixture(),preparationDate:null});
 assert.equal(r.valid,true);return r;
}
test('explicit current target scope reads real current preparation without a fabricated pending chain',()=>{
 const prepared=current();let value;assert.doesNotThrow(()=>{value=candidateVersions(prepared,'current-target');});
 assert.deepEqual([...value],[prepared.version]);assert.equal(prepared.preparationRefs,undefined);
});
test('candidate scope is mandatory with no unknown or current-to-chain fallback',()=>{
 const f=fixture();
 for(const mode of [undefined,'other',null])assert.throws(()=>candidateVersions(f.input,mode));
 assert.throws(()=>candidateVersions(current(),'pending-chain'));
 assert.throws(()=>candidateVersions({...current(),preparationRefs:f.input.preparationRefs},'current-target'));
});
test('current target strategy binds the actual owned package, source and prepared version fields',()=>{
 const p=current();
 for(const bad of [{...p,scope:'refresh-prepared-inputs-only'},{...p,sourceSha:'bad'},{...p,authorized:true},
  {...p,version:'9.0.0'},{...p,packageName:'other'},{...p,prepared:{...p.prepared,fromVersion:'0.0.0'}}])
  assert.throws(()=>candidateVersions(bad,'current-target'));
});
test('current candidate publication uses the SAME conflict reader and only current candidate observations',async()=>{
 const f=fixture(),prepared=current();f.candidateScope='current-target';
 const r=await createCandidatePublicationReader(f)(prepared);assert.equal(r.valid,true);
 assert.deepEqual([...r.versions],[prepared.version]);assert.equal(r.providerContinuityProved,false);assert.equal(r.authorized,false);
 assert.ok(f.calls.every(x=>x.registryVersion===undefined||x.registryVersion===prepared.version));
});
test('an omitted candidate strategy is refused before any remote collection',()=>{
 const f=fixture();delete f.candidateScope;assert.throws(()=>createCandidatePublicationReader(f));assert.equal(f.calls.length,0);
});
test('a failed or missing historical proposal job is uncertain even with successful preparation',async()=>{
 for(const mode of ['failure','missing']){
  const f=await retainedAttemptFixture();
  const attempt=f.collection.attempts.find(x=>x.runId===100);
  if(mode==='failure')attempt.jobs.find(x=>x.name==='proposal').conclusion='failure';
  else attempt.jobs=attempt.jobs.filter(x=>x.name!=='proposal');
  const r=createRetainedAttemptAssessor(f.profile)(f);assert.equal(r.eligible,false);
 }
});
test('published predecessor admission must be explicit and cannot be borrowed from a fabricated prepared chain',async()=>{
 const f=await retainedAttemptFixture();delete f.published;
 const r=createRetainedAttemptAssessor(f.profile)(f);assert.equal(r.eligible,false);
});
test('explicit published predecessor binds its package version, tree and publication digest',async()=>{
 const f=await retainedAttemptFixture();
 for(const published of [{...f.published,version:'0.0.0'},{...f.published,tree:'f'.repeat(40)},{...f.published,archiveDigest:'bad'}]){
  const r=createRetainedAttemptAssessor(f.profile)({...f,published});assert.equal(r.eligible,false);
 }
});

test('configured package conflict readers cannot borrow another internally coherent current preparation',async()=>{
 const f=fixture(),p=current(),wrong={...p,packageName:'other',prepared:{...p.prepared,package:'other'}};
 const r=await createCandidatePublicationReader({...f,candidateScope:'current-target'})(wrong);
 assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});

test('another historical invocation on the published source cannot borrow the actual publisher exemption',async()=>{
 const f=await retainedAttemptFixture({publishedPredecessor:true,change:(d,p)=>{
  if(p.includes('/runs/100/')&&d.jobs)d.jobs.find(x=>x.name==='publish').conclusion='success';
 }});
 const old=f.collection.runs.find(x=>x.id===100);old.id=101;
 for(const attempt of f.collection.attempts)if(attempt.runId===100){attempt.runId=101;for(const job of attempt.jobs)job.runId=101;}
 for(const artifact of f.collection.artifacts)if(artifact.runId===100)artifact.runId=101;
 const r=createRetainedAttemptAssessor(f.profile)(f);assert.equal(r.eligible,false);
});

test('a later attempt of the publication run cannot borrow the marker attempt exemption',async()=>{
 const f=await retainedAttemptFixture({publishedPredecessor:true,change:(d,p)=>{
  if(p.includes('/runs/100/')&&d.jobs)d.jobs.find(x=>x.name==='publish').conclusion='success';
 }});
 f.collection.runs.find(x=>x.id===100).run_attempt=2;
 const old=f.collection.attempts.find(x=>x.runId===100),later=structuredClone(old);later.attempt=2;
 for(const job of later.jobs){job.attempt=2;job.id+=100000;}
 f.collection.attempts.push(later);f.versions={...f.versions,attemptCount:3};
 const r=createRetainedAttemptAssessor(f.profile)(f);assert.equal(r.eligible,false);
});
