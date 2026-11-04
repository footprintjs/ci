import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {jsonData} from '../../src/eco/json-data.mjs';
import preparation from '../../src/guards/release-prepare.cjs';
import {createFoottraceCurrentInputReader} from '../../src/propose/foottrace-current-inputs.mjs';
import {bootstrapFixture,PRIVATE} from './bootstrap-provider-fixture.mjs';
const read=f=>createFoottraceCurrentInputReader({transport:f.transport,context:f.fullContext})();
function addIntent(inventory,version){
 const repository={id:123,full_name:'footprintjs/foottrace'},lineage={pr:10,head:'b'.repeat(40),merge:'c'.repeat(40),tree:'d'.repeat(40)};
 const bytes=preparation.intentBytes({schema:1,kind:'unpublished-recovery',package:'foottrace',version,sequence:1,repository,
  base:{sha:'a'.repeat(40),tree:preparation.treeOid(inventory)},origin:lineage,predecessor:lineage,previous:null,queuedFragments:preparation.fragmentQueue(inventory)},repository);
 inventory.set(preparation.intentPath(version,1),{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});
}
test('actual current M preparation is acquired without historical cohort or reference discovery',async()=>{
 const f=await bootstrapFixture({duplicate:true}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'native-current-prepared-inputs-only');
 assert.equal(r.prepared.sourceSha,f.M);assert.equal(r.prepared.sourceTree,f.current.commit.tree.sha);assert.equal(r.prepared.version,'1.11.0');
 assert.equal(isDeepStrictEqual(jsonData(r.prepared.prepared),jsonData(f.currentPrepared)),true);assert.equal(r.authorized,false);assert.equal(r.privateAppIdentityAdmitted,false);
 assert.equal(r.originalProducerAttributed,false);assert.equal(r.writerCredentialBindingAdmitted,false);
 assert.equal(f.calls.some(p=>p.includes('/actions/')||p.includes('/pulls')||p.includes('/releases')),false);
 assert.equal(JSON.stringify(r.reference).includes(PRIVATE),false);
});
test('active recovery remains outside the current-only ordinary metadata input path',async()=>{
 const f=await bootstrapFixture({changeCurrent:inventory=>addIntent(inventory,'1.10.0')}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(r.reason,'ordinary-active-recovery');
});
test('valid archived old-version intent data does not change the current ordinary preparation kind',async()=>{
 const f=await bootstrapFixture({changeCurrent:inventory=>addIntent(inventory,'1.9.0')}),r=await read(f);
 assert.equal(r.valid,true);assert.equal(r.reference.archivedIntentRecords,1);
});
test('a final current-main movement stays a refusal after both source phases',async()=>{
 let reads=0;const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/heads/main')&&++reads===4)d.object.sha='f'.repeat(40);}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(reads,4);
});
test('initial current-main mismatch stops before source acquisition',async()=>{
 const f=await bootstrapFixture({change:(d,p)=>{if(p.endsWith('/heads/main'))d.object.sha='f'.repeat(40);}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(f.calls.length,1);
});
test('invalid invocation facts or a different repository never cause current source reads',async()=>{
 const f=await bootstrapFixture();
 for(const context of [{...f.fullContext,runId:'500'},{...f.fullContext,repository:{id:999,full_name:'footprintjs/foottrace'}}]){
  const r=await createFoottraceCurrentInputReader({transport:f.transport,context})();assert.equal(r.valid,false);assert.equal(f.calls.length,0);
 }
});
