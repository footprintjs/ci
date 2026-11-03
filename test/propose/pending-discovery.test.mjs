import test from 'node:test';
import assert from 'node:assert/strict';
import native from '../../src/guards/release-github.cjs';
import {createPendingWitnessDiscovery} from '../../src/propose/pending-discovery.mjs';
import {createFoottraceDiscoveryPorts} from '../../src/propose/foottrace-discovery-ports.mjs';
import {createPendingPreparationChainReader} from '../../src/propose/pending-chain.mjs';
import {discoveryFixture,PRIVATE} from './discovery-provider-fixture.mjs';
async function discover(f) {const ports=createFoottraceDiscoveryPorts({api:f.api,repository:f.repository});return createPendingWitnessDiscovery({...f,...ports})({pending:f.pending,lineage:f.lineage,collection:f.collection});}
test('one actual native cohort per pending head is discovered from complete metadata and actual source/archive reads',async()=>{
 const f=await discoveryFixture(),r=await discover(f);assert.equal(r.valid,true);assert.equal(r.scope,'pending-witness-discovery-only');assert.equal(r.references.length,1);
 assert.equal(r.references[0].producer.runId,f.chain.witnesses[0].evidence.expected.runId);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);
 assert.equal(createPendingPreparationChainReader(f.profile)(r.backend.pending).valid,true);assert.equal(JSON.stringify(r.report).includes(PRIVATE),false);
 assert.equal(r.backend.pending.predecessor.head,f.lineage.predecessor.head);assert.notEqual(r.backend.pending.witnesses[0].originalSource.commit.sha,f.pending.reference.observedBase);
});
test('every hop is discovered oldest-first through the declared original L parent, bounded at eight',async()=>{
 const f=await discoveryFixture({count:8}),r=await discover(f);assert.equal(r.valid,true);assert.equal(r.references.length,8);
 assert.deepEqual(r.references.map(ref=>ref.pendingSha),f.chain.witnesses.map(w=>w.pendingSource.commit.sha));
});
test('two independently valid native prepare cohorts are ambiguous, never first-match selection',async()=>{
 const f=await discoveryFixture({duplicates:1}),r=await discover(f);assert.equal(r.valid,false);assert.equal(r.reason,'preparation-candidate-ambiguous');assert.equal(r.backend,null);
});
test('missing complete candidate metadata does not become an eligible empty history',async()=>{
 const f=await discoveryFixture();f.collection={...f.collection,runs:[],attempts:[],artifacts:[]};
 const r=await discover(f);assert.equal(r.valid,false);assert.equal(r.reason,'preparation-candidate-missing');
});
test('an expired candidate remains unavailable even if its digest was once known',async()=>{
 const f=await discoveryFixture({change:d=>{if(d.artifacts)for(const a of d.artifacts)a.expired=true;}});
 assert.equal((await discover(f)).valid,false);
});
for(const [name,change] of [
 ['wrong actual source tree',(d,p)=>{if(p.includes('/git/commits/'))d.tree.sha='f'.repeat(40);}],
 ['substituted artifact envelope',(d,p)=>{if(/\/actions\/artifacts\/\d+$/.test(p))d.workflow_run.head_sha='f'.repeat(40);}],
 ['substituted current archive bytes',(d,p)=>{if(Buffer.isBuffer(d))d[d.length-1]^=1;}],
 ['failed historical prepare job',(d,p)=>{if(d.jobs)for(const j of d.jobs)j.conclusion='failure';}],
])test(name+' holds discovered preparation',async()=>{const r=await discover(await discoveryFixture({change}));assert.equal(r.valid,false);assert.equal(r.authorized,false);});
test('a ninth pending hop is an explicit hold',async()=>{const r=await discover(await discoveryFixture({count:9}));assert.equal(r.valid,false);assert.equal(r.reason,'pending-chain-hop-limit');});
test('provider failure never becomes a nonmatching ignored candidate',async()=>{
 const f=await discoveryFixture({change:(d,p)=>{if(p.endsWith('/zip'))throw new Error(PRIVATE);}}),r=await discover(f);
 assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('current P cannot substitute for published L',async()=>{
 const f=await discoveryFixture();f.lineage={...f.lineage,predecessor:{...f.lineage.predecessor,head:f.pending.reference.head}};
 assert.equal((await discover(f)).valid,false);
});

test('an unsuccessful retained attempt with preparation bytes cannot be ignored in favor of another cohort',async()=>{
 const f=await discoveryFixture({duplicates:1,change:(d,p)=>{if((p.includes('/workflow')||p.endsWith('/attempts/1'))){if(d.id===556){d.status='completed';d.conclusion='failure';}if(d.workflow_runs)for(const r of d.workflow_runs)if(r.id===556){r.status='completed';r.conclusion='failure';}}}});
 const r=await discover(f);assert.equal(r.valid,false);assert.equal(r.backend,null);
});
for(const [name,change] of [
 ['actual numbered run identity',(d,p)=>{if(p.endsWith('/attempts/1'))d.run_attempt=2;}],
 ['actual numbered prepare job identity',(d,p)=>{if(d.jobs)for(const j of d.jobs)j.run_id=999;}],
 ['actual artifact repository',(d,p)=>{if(/\/actions\/artifacts\/\d+$/.test(p))d.workflow_run.repository_id=999;}],
 ['declared archive size',(d,p)=>{if(/\/actions\/artifacts\/\d+$/.test(p))d.size_in_bytes++;}],
 ['declared archive digest',(d,p)=>{if(/\/actions\/artifacts\/\d+$/.test(p))d.digest='sha256:'+'0'.repeat(64);}],
])test(name+' cannot substitute discovery evidence',async()=>{
 const r=await discover(await discoveryFixture({change}));assert.equal(r.valid,false);assert.equal(r.backend,null);
});
test('raw private metadata cannot change a successful owned discovery digest or leak through backend metadata',async()=>{
 const a=await discover(await discoveryFixture()),b=await discover(await discoveryFixture({change:d=>{if(!Buffer.isBuffer(d))d.private='DIFFERENT-PRIVATE';}}));
 assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.digest,b.digest);
 assert.equal(JSON.stringify(a).includes(PRIVATE),false);assert.equal(JSON.stringify(b).includes('DIFFERENT-PRIVATE'),false);
});
test('primitive provider rejection is still an owned finite hold',async()=>{
 const f=await discoveryFixture(),ports=createFoottraceDiscoveryPorts(f);
 const r=await assert.doesNotReject(()=>createPendingWitnessDiscovery({...f,...ports,readCandidateEvidence:async()=>{throw null;}})({pending:f.pending,lineage:f.lineage,collection:f.collection}));
 // doesNotReject proves the public rejection boundary; check the actual result separately.
 const held=await createPendingWitnessDiscovery({...f,...ports,readCandidateEvidence:async()=>{throw PRIVATE;}})({pending:f.pending,lineage:f.lineage,collection:f.collection});
 assert.equal(held.valid,false);assert.equal(JSON.stringify(held).includes(PRIVATE),false);
});

test('published base version must join every reconstructed source preparation',async()=>{
 const f=await discoveryFixture();f.lineage={...f.lineage,version:'1.9.0'};const r=await discover(f);assert.equal(r.valid,false);
});
test('retained native repository and complete workflow binding cannot be substituted',async()=>{
 for(const patch of [{repository:{id:999,full_name:'footprintjs/foottrace'}},{workflow:{path:'.github/workflows/other.yml'}},{valid:false}]){
  const f=await discoveryFixture();f.collection={...f.collection,...patch};const r=await discover(f);assert.equal(r.valid,false);assert.equal(r.backend,null);
 }
});
test('every pending head is independently source-read, including late chain hops',async()=>{
 const f=await discoveryFixture({count:8}),ports=createFoottraceDiscoveryPorts(f),seen=[];
 const r=await createPendingWitnessDiscovery({...f,...ports,readSource:async sha=>{seen.push(sha);return ports.readSource(sha);}})({pending:f.pending,lineage:f.lineage,collection:f.collection});
 assert.equal(r.valid,true);for(const w of f.chain.witnesses){assert.ok(seen.includes(w.originalSource.commit.sha));assert.ok(seen.includes(w.pendingSource.commit.sha));}
});
