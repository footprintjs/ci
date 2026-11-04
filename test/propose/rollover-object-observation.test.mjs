import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverObjectFixture,PRIVATE} from './rollover-object-provider-fixture.mjs';
const implementation=await import('../../src/propose/proposal-object-observation.mjs').catch(()=>({}));
function reader(f){
 assert.equal(typeof implementation.createFoottraceRolloverObjectReader,'function','ordinary SAME object-reader CODE entry absent');
 return implementation.createFoottraceRolloverObjectReader({transport:f.transport,context:f.fullContext});
}
test('ordinary signed object uses SAME observer with exact native M/L and no fabricated pending P',async()=>{
 const f=await rolloverObjectFixture(),r=await reader(f).commit(f.prepared,{sha:f.objectHead});
 assert.equal(r.valid,true);assert.deepEqual(r.object.parents,[f.M,f.f.originalHead]);assert.equal(r.object.head,f.objectHead);
 assert.equal(r.object.tree,f.prepared.targetTree);assert.equal(f.objectReads(),2);assert.equal(Object.hasOwn(f.prepared,'pendingSha'),false);
 for(const key of ['authorized','originalProducerAttributed','submissionAcknowledged','writerCredentialBindingAdmitted','retainedEligibilityAdmitted'])assert.equal(r[key],false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(f.f.calls.filter(c=>c.method!=='GET').length,0);
});
for(const [name,edit] of [
 ['ordered parents',d=>d.parents.reverse()],
 ['foreign tree',d=>d.commit.tree.sha='f'.repeat(40)],
 ['unsigned',d=>d.commit.verification.verified=false],
 ['foreign configured actor',d=>d.committer.id++]
])test('ordinary signed object refuses '+name,async()=>{
 const f=await rolloverObjectFixture({edit});assert.equal((await reader(f).commit(f.prepared,{sha:f.objectHead})).valid,false);
});
test('ordinary prepared input cannot carry a fake pending SHA to choose parents',async()=>{
 const f=await rolloverObjectFixture();assert.equal((await reader(f).commit({...f.prepared,pendingSha:f.P},{sha:f.objectHead})).valid,false);
 assert.equal(f.objectReads(),0);
});
test('ordinary observed parents come from native L even when DATA proposes another pair',async()=>{
 const f=await rolloverObjectFixture(),p={...f.prepared,proposedParents:[f.M,f.P]};
 const r=await reader(f).commit(p,{sha:f.objectHead});assert.equal(r.valid,true);assert.deepEqual(r.object.parents,[f.M,f.f.originalHead]);
});
test('ordinary signed object rechecks native retained L after the first object read',async()=>{
 const f=await rolloverObjectFixture({edit:(d,n,f)=>{if(n===1)f.f.tip=f.P;}});
 assert.equal((await reader(f).commit(f.prepared,{sha:f.objectHead})).valid,false);assert.equal(f.objectReads(),1);
});
test('ordinary signed object checks current producer after its LAST native object read',async()=>{
 const f=await rolloverObjectFixture({edit:(d,n,f)=>{if(n===2){const c=f.cohorts.find(c=>c.run.id===500);c.run.status='completed';c.run.conclusion='success';}}});
 assert.equal((await reader(f).commit(f.prepared,{sha:f.objectHead})).valid,false);assert.equal(f.objectReads(),2);
});
