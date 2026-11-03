import test from 'node:test';
import assert from 'node:assert/strict';
import {createObservedAppCommitReader} from '../../src/propose/observed-app-commit.mjs';
import {observedCommitFixture,PRIVATE} from './observed-app-commit-fixture.mjs';
const read=f=>createObservedAppCommitReader({api:f.api,repository:f.f.repository,settings:f.port.settings,readCurrentProposer:f.readCurrentProposer})(f.prepared,f.pending,f.current);
test('actual native current identity and observed REST resolved actors bind a signed exact target tree without creator or write authority',async()=>{
 const f=await observedCommitFixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.sameTargetTree,true);
 assert.equal(r.scope,'observed-app-commit-only');assert.equal(r.reference.head,f.head);
 assert.equal(r.reference.botId,f.f.bot.id);assert.equal(r.originalProducerAttributed,false);
 assert.equal(r.authorized,false);assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.retainedEligibilityAdmitted,false);
 assert.equal(f.commitCalls.length,2);assert.equal(f.identityCalls.length,4);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('a signed configured App commit with a different prepared target remains observation only and cannot select metadata repair',async()=>{
 const f=await observedCommitFixture({sameTree:false}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.sameTargetTree,false);assert.equal(r.authorized,false);
});
for(const [name,change] of [
 ['unsigned',d=>{d.commit.verification.verified=false;}],
 ['truthy verification',d=>{d.commit.verification.verified='true';}],
 ['invalid reason',d=>{d.commit.verification.reason='unknown_key';}],
 ['null resolved author',d=>{d.author=null;}],
 ['null resolved committer',d=>{d.committer=null;}],
 ['foreign numeric author',d=>{d.author.id++;}],
 ['foreign numeric committer',d=>{d.committer.id++;}],
 ['foreign author login',d=>{d.author.login='other[bot]';}],
 ['foreign committer login',d=>{d.committer.login='other[bot]';}],
 ['User actor',d=>{d.author.type='User';}],
 ['wrong response SHA',d=>{d.sha='f'.repeat(40);}],
 ['wrong tree',d=>{d.commit.tree.sha='f'.repeat(40);}],
 ['reordered parents',d=>{d.parents.reverse();}],
 ['raw author with plausible name only',d=>{d.author={name:'release-app[bot]',email:PRIVATE};}],
 ['missing verification',d=>{delete d.commit.verification;}]
])test(name+' holds before a second commit request',async()=>{
 const f=await observedCommitFixture({change}),r=await read(f);assert.equal(r.valid,false);assert.equal(r.reason,'observed-app-commit-unavailable');
 assert.equal(f.commitCalls.length,1);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('a valid changed App identity holds before any commit request',async()=>{
 const f=await observedCommitFixture({changeIdentity:d=>{d.identity.botId++;}}),r=await read(f);assert.equal(r.valid,false);assert.equal(f.commitCalls.length,0);
});
test('a fresh current identity conflict after the first commit stops before a second commit read',async()=>{
 const f=await observedCommitFixture({changeIdentity:(d,n)=>{if(n>=2)d.identity.prepareJobId++;}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(f.commitCalls.length,1);assert.equal(f.identityCalls.length,2);
});
test('second REST snapshot substitution is a permanent refusal even if unrelated private metadata is ignored',async()=>{
 const f=await observedCommitFixture({change:(d,n)=>{if(n===2)d.committer.id++;}}),r=await read(f);assert.equal(r.valid,false);assert.equal(f.commitCalls.length,2);
});
test('private signature/message/payload changes do not enter owned references or their digest',async()=>{
 const a=await read(await observedCommitFixture()),b=await read(await observedCommitFixture({change:d=>{d.private='OTHER';d.commit.message='OTHER';d.commit.verification.signature='OTHER';d.commit.verification.payload='OTHER';}}));
 assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.digest,b.digest);assert.equal(JSON.stringify(b).includes('OTHER'),false);
});
test('saved JSON cannot replace a current native identity or independently bound pending reference',async()=>{
 const f=await observedCommitFixture(),reader=createObservedAppCommitReader({api:f.api,repository:f.f.repository,settings:f.port.settings,readCurrentProposer:f.readCurrentProposer});
 for(const current of [{...f.current,privateAppIdentityAdmitted:false},{...f.current,writerCredentialBindingAdmitted:true},{...f.current,retainedEligibilityAdmitted:true},{...f.current,authorized:true},{...f.current,scope:'saved'},null]){
  const r=await reader(f.prepared,f.pending,current);assert.equal(r.valid,false);assert.equal(f.commitCalls.length,0);
 }
});

test('a different configured client cannot borrow another current App identity binding',async()=>{
 const f=await observedCommitFixture(),reader=createObservedAppCommitReader({api:f.api,repository:f.f.repository,
  settings:{...f.port.settings,clientId:'other-client'},readCurrentProposer:f.readCurrentProposer});
 const r=await reader(f.prepared,f.pending,f.current);assert.equal(r.valid,false);assert.equal(f.commitCalls.length,0);
});

test('the final native identity recheck cannot be skipped after the second commit snapshot',async()=>{
 const f=await observedCommitFixture({changeIdentity:(d,n)=>{if(n===4)d.identity.proposalJobId++;}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(f.commitCalls.length,2);assert.equal(f.identityCalls.length,4);
});
