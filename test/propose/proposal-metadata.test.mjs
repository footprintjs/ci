import test from 'node:test';
import assert from 'node:assert/strict';
const readers=await import('../../src/propose/proposal-metadata.mjs').catch(()=>({}));
import {createFoottracePendingObservationReader} from '../../src/propose/foottrace-pending.mjs';
import {pendingProviderFixture} from './pending-provider-fixture.mjs';
const PRIVATE='PRIVATE-UNOWNED-METADATA-PROVIDER';
const desired={title:'Release 1.11.0',body:'Computed release notes.\n'};
async function fixture({metadata=desired,change=()=>{}}={}){
 const f=pendingProviderFixture(),raw=f.api;let details=0;
 f.api=async(method,route,body)=>{
  const r=await raw(method,route,body);
  if(route.endsWith('/pulls/41')){
   details++;r.data.title=metadata.title;r.data.body=metadata.body;r.data.private=PRIVATE;change(r.data,details);
  }
  return r;
 };
 const observed=await createFoottracePendingObservationReader(f)();assert.equal(observed.valid,true);
 f.calls.length=0;details=0;return {...f,reference:observed.reference};
}
async function read(f,payload=desired,ref=f.reference){
 assert.equal(typeof readers.createFoottraceProposalMetadataReader,'function');
 return readers.createFoottraceProposalMetadataReader(f)(ref,payload);
}
test('native exact title/body observations are input knowledge and zero writer authority',async()=>{
 const f=await fixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.matches,true);
 assert.equal(r.scope,'pending-metadata-observation-only');assert.equal(r.authorized,false);assert.equal(r.executedWrites,0);
 assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.retainedEligibilityAdmitted,false);
 assert.equal(r.desiredDigest,r.observedDigest);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 assert.equal(JSON.stringify(r).includes(desired.body),false);assert.ok(f.calls.every(x=>x.method==='GET'&&x.body===undefined));
});
test('a stale title or exact-byte body is observed as stale, never silently normalized or patched',async()=>{
 for(const metadata of [{...desired,title:'Old release'},{...desired,body:desired.body+'\n'}]){
  const f=await fixture({metadata}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.matches,false);
  assert.notEqual(r.desiredDigest,r.observedDigest);assert.equal(r.authorized,false);
 }
});
test('all actual PR snapshots must agree on metadata as well as the exact native reference',async()=>{
 const f=await fixture({change:(d,n)=>{if(n>=3)d.body='Changed during read';}}),r=await read(f);
 assert.equal(r.valid,false);assert.equal(r.reason,'pending-metadata-unavailable');
});
test('a different expected head, parent, bot or PR cannot borrow a metadata observation',async()=>{
 const f=await fixture();
 for(const ref of [{...f.reference,head:'f'.repeat(40)},{...f.reference,botId:999},{...f.reference,parents:[...f.reference.parents].reverse()},{...f.reference,pr:42}]){
  const r=await read(f,desired,ref);assert.equal(r.valid,false);assert.equal(r.authorized,false);
 }
});
test('desired payload is closed, bounded and detached before provider reads',async()=>{
 const f=await fixture();
 for(const payload of [{...desired,force:true},{title:'x'.repeat(257),body:''},{title:'x',body:'x'.repeat(65537)},{title:'',body:''},{title:'x',body:null}]){
  const r=await read(f,payload);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
 }
 let invoked=false;const payload={title:'x'};Object.defineProperty(payload,'body',{get(){invoked=true;return PRIVATE;},enumerable:true});
 assert.equal((await read(f,payload)).valid,false);assert.equal(invoked,false);assert.equal(f.calls.length,0);
});
test('a caller cannot retarget the desired payload or expected reference during the first await',async()=>{
 const f=await fixture(),base=f.api,payload={...desired},ref=structuredClone(f.reference);let once=false;
 f.api=async(...args)=>{if(!once){once=true;payload.title='Substituted';ref.head='f'.repeat(40);}return base(...args);};
 const r=await read(f,payload,ref);assert.equal(r.valid,true);assert.equal(r.matches,true);
});
test('unavailable or malformed provider metadata stays unknown without raw private errors',async()=>{
 for(const change of [d=>{d.body={private:PRIVATE};},d=>{Object.defineProperty(d,'body',{get(){throw new Error(PRIVATE);},enumerable:true});}]){
  const f=await fixture({change}),r=await read(f);assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 }
 const f=await fixture(),base=f.api;f.api=(m,p,b)=>{if(p.endsWith('/pulls/41'))throw new Error(PRIVATE);return base(m,p,b);};
 const r=await read(f);assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('public provider null body represents the empty body value without granting an effect',async()=>{
 const f=await fixture({metadata:{title:'Empty',body:null}}),r=await read(f,{title:'Empty',body:''});
 assert.equal(r.valid,true);assert.equal(r.matches,true);assert.equal(r.authorized,false);
});

test('a coherent reference movement between the two native observations cannot borrow matching metadata',async()=>{
 const f=await fixture(),api=f.api,head='f'.repeat(40);let mainReads=0,changed=false;
 f.api=async(method,route,body)=>{
  if(route.endsWith('/git/ref/heads/main')&&++mainReads===3)changed=true;
  const reply=await api(method,route,body),data=reply.data;
  if(changed){
   if(route.includes('/pulls?'))for(const row of data)row.head.sha=head;
   if(route.endsWith('/pulls/41'))data.head.sha=head;
   if(route.endsWith('/git/ref/heads/release/next'))data.object.sha=head;
   if(route.includes('/git/commits/'))data.sha=head;
  }
  return reply;
 };
 const r=await read(f);assert.equal(r.valid,false);assert.equal(r.authorized,false);
});
test('provider metadata and desired UTF8 payloads keep their fixed byte bounds',async()=>{
 const f=await fixture({metadata:{title:desired.title,body:'x'.repeat(65537)}});
 assert.equal((await read(f)).valid,false);
 const g=await fixture();assert.equal((await read(g,{title:'漢'.repeat(86),body:''})).valid,false);
 assert.equal(g.calls.length,0);
});
