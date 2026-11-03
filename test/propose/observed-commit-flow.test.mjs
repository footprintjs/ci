import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runObservedAppCommitInspection} from '../../src/propose/observed-commit-flow.mjs';
import {createObservedAppCommitReader} from '../../src/propose/observed-app-commit.mjs';
import {explainReleaseRecord} from '../../src/record.mjs';
import {observedCommitFixture,PRIVATE} from './observed-app-commit-fixture.mjs';
const options=f=>({readInputs:()=>({prepared:f.prepared,pending:f.pending,current:f.current}),readCommit:createObservedAppCommitReader({
 api:f.api,repository:f.f.repository,settings:f.port.settings,readCurrentProposer:f.readCurrentProposer})});
test('native decide records signed observed-state knowledge and Foottrace can explain it after JSON reopen',async()=>{
 const f=await observedCommitFixture(),r=await runObservedAppCommitInspection(options(f));
 assert.equal(r.status,'observed-commit-only');assert.equal(r.record.complete,true);assert.equal(r.report.sameTargetTree,true);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.report.originalProducerAttributed,false);
 const saved=JSON.parse(JSON.stringify(r.record));assert.equal(JSON.stringify(saved).includes(PRIVATE),false);
 const explanation=explainReleaseRecord(saved,'proposeObservedResult');assert.ok(explanation);
 assert.match(JSON.stringify(saved),/propose-observed-app-commit-decision/);
 assert.equal(r.backend.reference.head,f.head);
});
test('unsigned provider state is retained as a native hold with no backend grant',async()=>{
 const f=await observedCommitFixture({change:d=>{d.commit.verification.verified=false;}}),r=await runObservedAppCommitInspection(options(f));
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.record.complete,true);
 assert.equal(r.record.snapshot.sharedState.proposeObservedResult.reason,'observed-app-commit-unavailable');
});
test('an incomplete native observed-state record discards a fully acquired backend observation',async()=>{
 const f=await observedCommitFixture(),r=await runObservedAppCommitInspection({...options(f),recordLimitBytes:256});
 assert.equal(r.status,'incomplete');assert.equal(r.backend===null,true);assert.equal(r.record.complete,false);
});
test('unknown reader exceptions and malformed code-port results cannot enter native record facts',async()=>{
 const f=await observedCommitFixture(),base=options(f);
 for(const readCommit of [async()=>{throw new Error(PRIVATE);},async()=>null,async()=>({valid:true,scope:'observed-app-commit-only',authorized:true,private:PRIVATE})]){
  const r=await runObservedAppCommitInspection({...base,readCommit});assert.equal(r.status,'held');assert.equal(r.backend===null,true);
  assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
});

test('native stage independently refuses changed authority flags, target facts and private reference spill from a code port',async()=>{
 const f=await observedCommitFixture(),base=options(f),good=await base.readCommit(f.prepared,f.pending,f.current);
 assert.equal(good.valid,true);
 for(const mutate of [
  v=>{v.authorized=true;},v=>{v.writerCredentialBindingAdmitted=true;},v=>{v.retainedEligibilityAdmitted=true;},
  v=>{v.originalProducerAttributed=true;},v=>{v.currentIdentityReferenceBound=false;},v=>{v.adjacentSnapshotOnly=false;},
  v=>{v.sameTargetTree=false;},v=>{v.digest='f'.repeat(64);},v=>{v.reference.private=PRIVATE;v.digest=createHash('sha256').update(JSON.stringify(v.reference)).digest('hex');}
 ]){
  const value=structuredClone(good);mutate(value);
  const r=await runObservedAppCommitInspection({...base,readCommit:async()=>value});
  assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
 let getters=0;const value={...good};Object.defineProperty(value,'reference',{get:()=>{getters++;throw new Error(PRIVATE);}});
 const r=await runObservedAppCommitInspection({...base,readCommit:async()=>value});
 assert.equal(r.status,'held');assert.equal(getters,0);assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
});
