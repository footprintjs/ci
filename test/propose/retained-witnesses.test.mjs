import test from 'node:test';
import assert from 'node:assert/strict';
import {createRetainedWitnessReader} from '../../src/propose/retained-witnesses.mjs';
import {witnessProviderFixture,PRIVATE} from './witness-provider-fixture.mjs';
const read=async f=>createRetainedWitnessReader(f)(f.prepared,f.collection);
test('the admitted preparation binds actual retained run/attempt/job/artifact, Git trees and downloaded ZIP bytes',async()=>{
 const f=await witnessProviderFixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'retained-preparation-witnesses-only');
 assert.equal(r.witnesses.length,1);assert.equal(r.witnesses[0].producer.runId,456);assert.equal(r.witnesses[0].archiveDigest,f.prepared.preparationRefs[0].artifactDigest);
 assert.equal(r.workflowDigest,f.collection.digest);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.privateAppIdentityAdmitted,false);
 assert.equal(r.witnesses[0].artifactAttemptFieldInvented,false);assert.ok(f.calls.some(c=>c.route.endsWith('/zip')));assert.ok(f.calls.every(c=>c.method==='GET'&&c.body===undefined));
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('preparation refs retain the admitted day, never a guessed current date',async()=>{
 const f=await witnessProviderFixture();assert.equal(f.prepared.preparationRefs[0].preparationDate,f.witness.originalSource.commit.committer.date.slice(0,10));
});
for(const [name,mutate] of [
 ['missing producer run',f=>{f.collection={...f.collection,runs:[]};}],
 ['missing original attempt',f=>{f.collection={...f.collection,attempts:[]};}],
 ['missing original prepare job',f=>{f.collection={...f.collection,attempts:f.collection.attempts.map(x=>({...x,jobs:[]}))};}],
 ['failed prepare job',f=>{f.collection={...f.collection,attempts:f.collection.attempts.map(x=>({...x,jobs:x.jobs.map(j=>({...j,conclusion:'failure'}))}))};}],
 ['missing artifact',f=>{f.collection={...f.collection,artifacts:[]};}],
 ['expired artifact',f=>{f.collection={...f.collection,artifacts:f.collection.artifacts.map(x=>({...x,expired:true}))};}],
 ['wrong native artifact name',f=>{f.collection={...f.collection,artifacts:f.collection.artifacts.map(x=>({...x,name:'other-prepare'}))};}],
 ['wrong artifact source',f=>{f.collection={...f.collection,artifacts:f.collection.artifacts.map(x=>({...x,sourceSha:'f'.repeat(40)}))};}],
 ['wrong repository',f=>{f.collection={...f.collection,repository:{id:999,full_name:'fork/foottrace'}};}],
 ['ambiguous artifacts',f=>{f.collection={...f.collection,artifacts:[...f.collection.artifacts,...f.collection.artifacts]};}],
 ['wrong preparation profile',f=>{f.profile={...f.profile,id:'other-profile'};}],
])test(name+' holds before archive acquisition',async()=>{
 const f=await witnessProviderFixture();mutate(f);const r=await read(f);assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(f.calls.some(c=>c.route.endsWith('/zip')),false);
});
for(const [name,change] of [
 ['actual source tree differs',(d,p)=>{if(p.includes('/git/commits/')&&d.sha==='a'.repeat(40))d.tree.sha='f'.repeat(40);}],
 ['actual pending tree differs',(d,p)=>{if(p.includes('/git/commits/')&&d.sha==='c'.repeat(40))d.tree.sha='f'.repeat(40);}],
 ['actual pending parent differs',(d,p)=>{if(p.includes('/git/commits/')&&d.sha==='c'.repeat(40))d.parents[1].sha='f'.repeat(40);}],
 ['source-day differs',(d,p)=>{if(p.includes('/git/commits/')&&d.sha==='a'.repeat(40))d.committer.date='2026-01-01T00:00:00Z';}],
 ['actual archive differs',(d,p)=>{if(Buffer.isBuffer(d))d[d.length-1]^=1;}],
])test(name+' holds without target code execution or raw data in the result',async()=>{
 const r=await read(await witnessProviderFixture({change}));assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('unavailable artifact GET retains a finite failed boundary with no private error',async()=>{
 const f=await witnessProviderFixture(),base=f.api;f.api=(m,p,b)=>{if(p.endsWith('/zip'))throw new Error(PRIVATE);return base(m,p,b);};
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.observations?.some(x=>x.status==='unavailable'));assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});

test('every repeated preparation is independently joined while published L stays separate',async()=>{
 const f=await witnessProviderFixture({chainCount:2}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.witnesses.length,2);
 assert.equal(r.witnesses[1].pendingSha,f.prepared.preparationRefs[1].pendingSha);assert.equal(f.calls.filter(x=>x.route.endsWith('/zip')).length,2);
});
test('the eight-witness bound admits all24actual read boundaries without truncation',async()=>{
 const f=await witnessProviderFixture({chainCount:8}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.witnesses.length,8);assert.equal(r.observations.length,24);
});
test('a later actual head cannot substitute published L for its immediate pending parent',async()=>{
 const f=await witnessProviderFixture({chainCount:2}),base=f.api,head=f.prepared.preparationRefs[1].pendingSha;
 f.api=async(m,p,b)=>{const reply=await base(m,p,b);if(p.endsWith('/git/commits/'+head))reply.data.parents[1].sha=f.prepared.predecessor.head;return reply;};
 assert.equal((await read(f)).valid,false);
});

test('actual retained prepare job name must still match the declared producer role',async()=>{
 const f=await witnessProviderFixture();f.collection={...f.collection,attempts:f.collection.attempts.map(x=>({...x,jobs:x.jobs.map(j=>({...j,name:'publish'}))}))};
 assert.equal((await read(f)).valid,false);assert.equal(f.calls.some(c=>c.route.endsWith('/zip')),false);
});
test('API artifact size and actual downloaded bytes cannot disagree',async()=>{
 const f=await witnessProviderFixture();f.collection={...f.collection,artifacts:f.collection.artifacts.map(x=>({...x,size:x.size+1}))};
 assert.equal((await read(f)).valid,false);
});

test('private unowned provider fields cannot alter the joined witness digest',async()=>{
 const a=await read(await witnessProviderFixture()),b=await read(await witnessProviderFixture({change:d=>{if(!Buffer.isBuffer(d))d.private='other private payload';}}));
 assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.digest,b.digest);assert.doesNotMatch(JSON.stringify(a),/"type":"Buffer"/);
});
