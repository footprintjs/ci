import test from 'node:test';
import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import {createRetainedSourceVersionReader} from '../../src/propose/retained-source-versions.mjs';
import {sourceVersionFixture,PRIVATE} from './source-version-provider-fixture.mjs';
const read=async f=>createRetainedSourceVersionReader(f)(f.prepared,f.collection);
test('actual complete retained workflow data binds each immutable source package version once',async()=>{
 const f=await sourceVersionFixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'retained-source-versions-only');
 assert.equal(r.sources.length,1);assert.equal(r.sources[0].version,'1.0.0');assert.equal(r.attemptCount,2);assert.equal(r.candidateEffectAttempts.length,0);
 assert.equal(r.workflowDigest,f.collection.digest);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.providerContinuityProved,false);
 assert.equal(f.calls.length,1);assert.ok(f.calls.every(x=>x.method==='GET'&&x.body===undefined));assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('candidate source effect stages hold even with no current registry or reservation',async()=>{
 const f=await sourceVersionFixture({version:'1.1.1',workflowChange:(d,p)=>{if(d.jobs)d.jobs[1].conclusion='failure';}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(r.reason,'candidate-effect-or-submission-uncertain');assert.ok(r.candidateEffectAttempts?.length>0);assert.equal(r.authorized,false);
});
test('all candidate versions include the newly prepared target',async()=>{
 const f=await sourceVersionFixture({version:'1.2.0',workflowChange:(d,p)=>{if(d.jobs)d.jobs[1].conclusion='success';}}),r=await read(f);assert.equal(r.valid,false);assert.equal(r.reason,'candidate-effect-or-submission-uncertain');
});
test('terminal effects from another admitted package version remain data, not authority',async()=>{
 const f=await sourceVersionFixture({workflowChange:(d,p)=>{if(d.jobs)d.jobs[1].conclusion='success';}}),r=await read(f);
 assert.equal(r.valid,true);assert.equal(r.candidateEffectAttempts.length,0);assert.equal(r.authorized,false);
});
test('nonterminal observations remain explicit, never exempted as a fabricated current producer',async()=>{
 const f=await sourceVersionFixture({workflowChange:(d,p)=>{if(d.jobs){d.jobs[1].status='in_progress';d.jobs[1].conclusion=null;}}}),r=await read(f);
 assert.equal(r.valid,true);assert.equal(r.nonterminalAttempts.length,2);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);
});
for(const [name,change] of [
 ['wrong blob',(d)=>{d.sha='b'.repeat(40);}],
 ['wrong decoded size',d=>{d.size++;}],
 ['wrong encoding',d=>{d.encoding='utf8';}],
 ['wrong immutable path',d=>{d.path='other.json';}],
 ['directory response',d=>{d.type='dir';}],
 ['invalid UTF8',d=>{const b=Buffer.concat([Buffer.from('{"name":"foottrace","version":"1.0.0","private":"'),Buffer.from([255]),Buffer.from('"}')]);d.content=b.toString('base64');d.size=b.length;d.sha=preparation.gitObject('blob',b);}],
 ['oversize metadata',d=>{d.size=128*1024+1;}],
 ['nominal scalar private object',d=>{d.sha={private:PRIVATE};}],
])test(name+' holds with no raw package/body/error retained',async()=>{
 const f=await sourceVersionFixture({packageChange:change}),r=await read(f);assert.equal(r.valid,false);assert.equal(r.reason,'retained-source-version-unavailable');assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('unknown source package name holds rather than classifying unrelated releases',async()=>{
 const f=await sourceVersionFixture();f.packageName='other-package';const r=await read(f);assert.equal(r.valid,false);
});
test('missing retained attempts cannot masquerade as a complete collection',async()=>{
 const f=await sourceVersionFixture();f.collection={...f.collection,attempts:f.collection.attempts.slice(1)};assert.equal((await read(f)).valid,false);
});
test('an empty jobs collection stays unknown rather than proving no submission',async()=>{
 const f=await sourceVersionFixture();f.collection={...f.collection,attempts:f.collection.attempts.map(x=>({...x,jobs:[]}))};assert.equal((await read(f)).valid,false);
});
test('a changed attempt source cannot use another run source package',async()=>{
 const f=await sourceVersionFixture();f.collection={...f.collection,attempts:f.collection.attempts.map(x=>({...x,sourceSha:'b'.repeat(40)}))};assert.equal((await read(f)).valid,false);
});
test('saved claimed authority is refused before any package read',async()=>{
 const f=await sourceVersionFixture();f.collection={...f.collection,authorized:true};const r=await read(f);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('an unavailable immutable source retains a failed boundary without private errors',async()=>{
 const f=await sourceVersionFixture();f.api=async()=>{throw new Error(PRIVATE);};const r=await read(f);assert.equal(r.valid,false);
 assert.ok(r.observations?.some(x=>x.status==='unavailable'));assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});

test('several retained runs sharing one immutable source acquire that package only once',async()=>{
 const f=await sourceVersionFixture({runs:2}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.attemptCount,4);assert.equal(r.sources.length,1);assert.equal(f.calls.length,1);
});
test('every distinct retained source receives its own blob/package binding',async()=>{
 const source=id=>id===100?'a'.repeat(40):'b'.repeat(40);
 const f=await sourceVersionFixture({runs:2,workflowChange:d=>{
  if(d.workflow_runs)for(const run of d.workflow_runs)run.head_sha=source(run.id);
  if(d.head_sha)d.head_sha=source(d.id);
  if(d.jobs)for(const job of d.jobs)job.head_sha=source(job.run_id);
  if(d.artifacts)for(const asset of d.artifacts)asset.workflow_run.head_sha=source(asset.workflow_run.id);
 }}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.sources.length,2);assert.equal(f.calls.length,2);
});

test('a job attributed to another run cannot classify this retained attempt',async()=>{
 const f=await sourceVersionFixture();f.collection={...f.collection,attempts:f.collection.attempts.map(row=>({...row,jobs:row.jobs.map(job=>({...job,runId:999}))}))};
 assert.equal((await read(f)).valid,false);
});
