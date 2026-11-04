import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverFixture} from './rollover-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-rollover-inputs.mjs').catch(()=>({}));
function reader(f){assert.equal(typeof implementation.createFoottraceRolloverInputReader,'function','ordinary closed-published rollover input adapter absent');
 return implementation.createFoottraceRolloverInputReader({transport:f.transport,context:f.fullContext});}
test('ordinary input joins actual published L and exact closed retained ref without inventing pending P',async()=>{
 const f=await rolloverFixture(),r=await reader(f)(f.prepared);
 assert.equal(r.valid,true);assert.equal(r.scope,'closed-published-rollover-inputs-only');
 assert.equal(r.reference.retainedHeadSha,f.f.originalHead);assert.equal(r.reference.predecessor.head,f.f.originalHead);
 assert.deepEqual(r.reference.nextParents,[f.M,f.f.originalHead]);assert.equal(r.reference.targetTree,f.prepared.targetTree);
 assert.equal(Object.hasOwn(r,'pendingSha'),false);assert.equal(Object.hasOwn(r,'preparationRefs'),false);
 assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.writerCredentialBindingAdmitted,false);
 assert.equal(r.providerContinuityProved,false);assert.equal(r.erasedHistoryProved,false);
 assert.equal(f.f.calls.filter(c=>c.method!=='GET').length,0);
});
for(const kind of ['unrelated-ref','open-pr','target-tree','package-profile','payload-notes','source-date'])test('ordinary input refuses '+kind,async()=>{
 const f=await rolloverFixture();let p=structuredClone(f.prepared);
 if(kind==='unrelated-ref')f.f.tip=f.P;
 if(kind==='open-pr')f.f.pulls.push(structuredClone(f.pending));
 if(kind==='target-tree')p.targetTree='f'.repeat(40);
 if(kind==='package-profile')p.packageName='other-package';
 if(kind==='payload-notes')p.prepared.notes+='unbound notes';
 if(kind==='source-date')p.preparationDate='2026-11-04';
 const r=await reader(f)(p);assert.equal(r.valid,false);assert.equal(r.authorized,false);
 assert.equal(f.f.calls.filter(c=>c.method!=='GET').length,0);
});
test('second full native phase cannot borrow first closed-published observation',async()=>{
 let closed=0;const f=await rolloverFixture({change:(d,p)=>{
  if(p.includes('/pulls?state=closed')){closed++;if(closed===2)d.forEach(row=>{row.merged_at=null;});}
 }}),r=await reader(f)(f.prepared);
 assert.equal(closed,2,'actual second native retained-reference phase reached');assert.equal(r.valid,false);
});
test('native acquisition errors remain value-free unavailable, never registry absence or a grant',async()=>{
 const secret='PRIVATE-ORDINARY-INPUT-FAILURE';let armed=false;
 const f=await rolloverFixture({change:(d,p)=>{if(armed&&p==='/repos/footprintjs/foottrace')throw new Error(secret);}});
 armed=true;const r=await reader(f)(f.prepared);
 assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(secret),false);
});
test('a different actual closed same-version merge is not the published predecessor L',async()=>{
 const f=await rolloverFixture(),published=f.f.pulls.find(p=>p.merged_at);
 // B is an actual ancestor of M, with a real same-version Git inventory.
 // A separate coherent closed PR at B remains unpublished in this fixture.
 f.f.pulls.push({...structuredClone(published),id:2202,number:102,head:{...structuredClone(published.head),sha:f.B},
  merge_commit_sha:f.B,base:{...structuredClone(published.base),sha:f.f.originalMerge}});
 f.f.tip=f.B;
 const r=await reader(f)(f.prepared);assert.equal(r.valid,false);
 assert.equal(r.authorized,false);assert.equal(f.f.calls.filter(c=>c.method!=='GET').length,0);
});
