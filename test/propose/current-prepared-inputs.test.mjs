import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {jsonData} from '../../src/eco/json-data.mjs';
import {createCurrentPreparedInputReader} from '../../src/propose/current-prepared-inputs.mjs';
import {createFoottracePreparationProfile} from '../../src/propose/foottrace-profile.mjs';
import {sourceFixture,prepareFixture} from './prepared-fixtures.mjs';
import preparation from '../../src/guards/release-prepare.cjs';
const profile=createFoottracePreparationProfile();
test('current-only input independently reconstructs complete source/queue/date/target without a pending creator or witness',()=>{
 const source=sourceFixture(),r=createCurrentPreparedInputReader(profile)({source,preparationDate:null});
 assert.equal(r.valid,true);assert.equal(r.scope,'current-prepared-inputs-only');assert.equal(r.sourceSha,source.commit.sha);
 assert.equal(r.sourceTree,source.commit.tree.sha);assert.equal(r.version,'1.10.1');assert.equal(r.fromVersion,'1.10.0');
 assert.equal(isDeepStrictEqual(jsonData(r.prepared),jsonData(prepareFixture({inventory:source.inventory,date:'2026-11-02'}))),true);
 for(const key of ['preparationRefs','predecessor','pendingSha','proposedParents'])assert.equal(Object.hasOwn(r,key),false);
 assert.equal(r.authorized,false);assert.equal(r.originalProducerAttributed,false);
});
test('current-only source handles native evidence date strategy without falling back to a plausible source date',()=>{
 const p={...profile,id:'native-day-fixture',dateLaw:'native-evidence-day'},read=createCurrentPreparedInputReader(p),source=sourceFixture();
 assert.equal(read({source,preparationDate:null}).valid,false);
 const r=read({source,preparationDate:'2026-11-01'});assert.equal(r.valid,true);assert.equal(r.preparationDate,'2026-11-01');
});
test('caller dates cannot override a source-committer profile and no pending-data hook is accepted',()=>{
 const read=createCurrentPreparedInputReader(profile),source=sourceFixture();
 assert.equal(read({source,preparationDate:'2026-11-01'}).valid,false);
 assert.equal(read({source,preparationDate:null,pending:{witnesses:[]}}).valid,false);
});
test('current package/lock version or selected source blob substitution cannot become prepared input knowledge',()=>{
 for(const alter of [s=>{s.inventory.get('package.json').bytes=Buffer.from('{}');},s=>{s.inventory.get('package-lock.json').sha='e'.repeat(40);} ]){
  const source=sourceFixture();alter(source);
  assert.equal(createCurrentPreparedInputReader(profile)({source,preparationDate:null}).valid,false);
 }
});
test('a new raw minor fragment produces its own complete target instead of borrowing an old patch tree',()=>{
 const source=sourceFixture(),bytes=Buffer.from('---\ntype: added\nbump: minor\n---\n\n- A new independent minor change.\n');
 source.inventory.set('.changes/new.md',{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});source.commit.tree.sha=preparation.treeOid(source.inventory);
 const r=createCurrentPreparedInputReader(profile)({source,preparationDate:null});assert.equal(r.valid,true);assert.equal(r.version,'1.11.0');assert.equal(r.queue.length,2);
});
