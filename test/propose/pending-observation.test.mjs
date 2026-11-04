import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoottracePendingObservationReader,createFoottracePendingReader} from '../../src/propose/foottrace-pending.mjs';
import {pendingProviderFixture,PRIVATE} from './pending-provider-fixture.mjs';
test('public pending head/tree/parents are discovered before any caller-prepared witness exists',async()=>{
 const f=pendingProviderFixture(),expected=f.prepared;delete f.prepared;
 const r=await createFoottracePendingObservationReader(f)();assert.equal(r.valid,true);assert.equal(r.reference.head,expected.pendingSha);
 assert.equal(r.reference.tree,expected.pendingTree);assert.deepEqual(r.reference.parents,[expected.preparationRefs[0].sourceSha,expected.predecessor.head]);
 assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.privateAppIdentityAdmitted,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('observation discovers actual changed parents while the existing prepared-input join still refuses them',async()=>{
 const change=(d,p)=>{if(p.includes('/git/commits/'))d.parents[0].sha='f'.repeat(40);};
 const f=pendingProviderFixture(change),observed=await createFoottracePendingObservationReader(f)();
 assert.equal(observed.valid,true);assert.equal(observed.reference.parents[0],'f'.repeat(40));
 assert.equal((await createFoottracePendingReader(pendingProviderFixture(change))(f.prepared)).valid,false);
});
test('fully coherent substituted native P is observed, then fails the independently prepared-head join',async()=>{
 const change=(d,p)=>{const rows=p.includes('/pulls?')?d:p.endsWith('/pulls/41')?[d]:[];for(const row of rows)row.head.sha='f'.repeat(40);
 if(p.endsWith('/git/ref/heads/release/next'))d.object.sha='f'.repeat(40);if(p.includes('/git/commits/'))d.sha='f'.repeat(40);};
 const f=pendingProviderFixture(change),observed=await createFoottracePendingObservationReader(f)();assert.equal(observed.valid,true);assert.equal(observed.reference.head,'f'.repeat(40));
 const g=pendingProviderFixture(change);assert.equal((await createFoottracePendingReader(g)(g.prepared)).valid,false);
});
for(const [name,change] of [
 ['moved main',(d,p,n)=>{if(p.endsWith('/git/ref/heads/main')&&n.mainReads>1)d.object.sha='f'.repeat(40);}],
 ['second open PR',(d,p)=>{if(p.includes('/pulls?'))d.push({...structuredClone(d[0]),id:42,number:42});}],
 ['auto merge',(d,p)=>{const rows=p.includes('/pulls?')?d:p.endsWith('/pulls/41')?[d]:[];for(const row of rows)row.auto_merge={private:PRIVATE};}],
 ['moved P',(d,p,n)=>{if(p.endsWith('/pulls/41')&&n.detailReads>1)d.head.sha='f'.repeat(40);}],
])test('bootstrap retains '+name+' refusal without prepared inputs',async()=>{
 const r=await createFoottracePendingObservationReader(pendingProviderFixture(change))();assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});

test('coherent actual tree substitution remains observation only and fails the prepared-tree join',async()=>{
 const change=(d,p)=>{if(p.includes('/git/commits/'))d.tree.sha='f'.repeat(40);};
 const f=pendingProviderFixture(change),observed=await createFoottracePendingObservationReader(f)();assert.equal(observed.valid,true);assert.equal(observed.reference.tree,'f'.repeat(40));
 const g=pendingProviderFixture(change);assert.equal((await createFoottracePendingReader(g)(g.prepared)).valid,false);
});
test('actual commit identity must match the discovered PR/ref head',async()=>{
 const r=await createFoottracePendingObservationReader(pendingProviderFixture((d,p)=>{if(p.includes('/git/commits/'))d.sha='f'.repeat(40);}))();
 assert.equal(r.valid,false);
});
test('an initial conflicting branch observation cannot disappear at the later read',async()=>{
 let reads=0;const f=pendingProviderFixture((d,p)=>{if(p.endsWith('/git/ref/heads/release/next')&&++reads===1)d.object.sha='f'.repeat(40);});
 assert.equal((await createFoottracePendingObservationReader(f)()).valid,false);
});
test('a coherent PR/ref naming current main cannot be discovered as a prepared proposal',async()=>{
 const f=pendingProviderFixture((d,p)=>{const rows=p.includes('/pulls?')?d:p.endsWith('/pulls/41')?[d]:[];for(const row of rows)row.head.sha='e'.repeat(40);
 if(p.endsWith('/git/ref/heads/release/next'))d.object.sha='e'.repeat(40);if(p.includes('/git/commits/'))d.sha='e'.repeat(40);});
 assert.equal((await createFoottracePendingObservationReader(f)()).valid,false);
});
test('the discovered public bot identity must match the actual PR author',async()=>{
 const f=pendingProviderFixture((d,p)=>{const rows=p.includes('/pulls?')?d:p.endsWith('/pulls/41')?[d]:[];for(const row of rows)row.user.id=501;});
 assert.equal((await createFoottracePendingObservationReader(f)()).valid,false);
});
