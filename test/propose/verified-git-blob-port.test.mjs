import test from 'node:test';
import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import native from '../../src/guards/git-source.cjs';
const implementation=await import('../../src/guards/git-blob.cjs').then(m=>m.default).catch(()=>({}));
const repository={id:123,full_name:'footprintjs/foottrace'},context={repository};
function entry(){assert.equal(typeof implementation.createGitBlobOwner,'function','SAME owner verified blob decorator absent');return implementation;}
const raw=bytes=>({sha:preparation.gitObject('blob',bytes),encoding:'base64',size:bytes.length,content:bytes.toString('base64')});
function fixture(options={}){
 const m=entry(),owner=m.createGitBlobOwner(repository,options),rows=new Map(),calls=[];let edit=x=>x;
 const add=text=>{const b=Buffer.from(text),v=raw(b);rows.set(v.sha,v);return v.sha;};
 const api=async(method,route)=>{assert.equal(method,'GET');const oid=route.split('/').at(-1);calls.push(oid);return {data:await edit(structuredClone(rows.get(oid)))};};
 m.bindGitBlobOwner(api,owner);
 return {m,owner,add,calls,api,read:oid=>native.sourceView(api,context).blob(oid),edit:fn=>{edit=fn;}};
}
test('verified blobs are reused across fresh native views on the SAME owner only',async()=>{
 const f=fixture(),oid=f.add('one actual immutable blob');
 assert.equal((await f.read(oid)).toString(),'one actual immutable blob');
 assert.equal((await f.read(oid)).toString(),'one actual immutable blob');assert.equal(f.calls.length,1);
});
test('different captured owners cannot reuse one another even for the same repository/OID',async()=>{
 const a=fixture(),b=fixture(),oid=a.add('same');assert.equal(b.add('same'),oid);
 await a.read(oid);await b.read(oid);assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
});
test('decorated source view refuses another repository identity before a cache hit',async()=>{
 const f=fixture(),oid=f.add('repo');await f.read(oid);
 await assert.rejects(native.sourceView(f.api,{repository:{...repository,id:124}}).blob(oid));assert.equal(f.calls.length,1);
});
test('failed malformed oversize and OID-mismatched blobs are never admitted or negatively cached',async()=>{
 const m=entry();
 for(const kind of ['failure','sha','encoding','size','bytes','oversize']){
  const f=fixture(),oid=f.add('original');let bad=true;
  f.edit(v=>{
   if(!bad)return v;
   if(kind==='failure')throw Error('OFFLINE_UNAVAILABLE');
   if(kind==='sha')v.sha='f'.repeat(40);if(kind==='encoding')v.encoding='utf-8';if(kind==='size')v.size++;
   if(kind==='bytes')v.content=Buffer.from('mismatch').toString('base64');if(kind==='oversize')v.size=2*1024*1024+1;
   return v;
  });
  await assert.rejects(f.read(oid));assert.equal(m.gitBlobOwnerFacts(f.owner).entries,0);
  bad=false;assert.equal((await f.read(oid)).toString(),'original');assert.equal(f.calls.length,2);
 }
});
test('store never lends its bytes; caller mutation cannot poison a later hit',async()=>{
 const f=fixture(),oid=f.add('safe');const a=await f.read(oid);a.fill(0);
 const b=await f.read(oid);assert.equal(b.toString(),'safe');b.fill(0);assert.equal((await f.read(oid)).toString(),'safe');assert.equal(f.calls.length,1);
});
for(const kind of ['entries','bytes'])test('full verified store '+kind+' falls through without eviction or failing a valid read',async()=>{
 const f=fixture(kind==='entries'?{maxEntries:1}:{maxBytes:4}),first=f.add('four'),other=f.add('new');
 await f.read(first);await assert.doesNotReject(async()=>{assert.equal((await f.read(other)).toString(),'new');await f.read(other);await f.read(first);});
 assert.deepEqual(f.calls,[first,other,other]);assert.equal(f.m.gitBlobOwnerFacts(f.owner).entries,1);
});
test('concurrent same-OID misses share one verified acquisition and detached results',async()=>{
 const f=fixture(),oid=f.add('shared');let release,entered;
 const wait=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 f.edit(async v=>{entered();await wait;return v;});const requests=Array.from({length:16},()=>f.read(oid));await started;
 assert.equal(f.calls.length,1);assert.equal(f.m.gitBlobOwnerFacts(f.owner).pending,1);release();
 const rows=await Promise.all(requests);rows[0].fill(0);assert.equal(rows[1].toString(),'shared');
 assert.equal(f.m.gitBlobOwnerFacts(f.owner).pending,0);
});
test('concurrent distinct misses stay bounded and excess misses use the normal verified path',async()=>{
 const f=fixture({maxPending:2}),oids=['aa','bb','cc'].map(f.add);let release;
 const wait=new Promise(r=>{release=r;});f.edit(async v=>{await wait;return v;});
 const reads=oids.map(f.read);await new Promise(r=>setImmediate(r));assert.equal(f.m.gitBlobOwnerFacts(f.owner).pending,2);assert.equal(f.calls.length,3);
 release();assert.deepEqual((await Promise.all(reads)).map(x=>x.toString()),['aa','bb','cc']);assert.equal(f.m.gitBlobOwnerFacts(f.owner).pending,0);
});
test('a shared failed miss propagates to every waiter and is not replaced by a hit or retry',async()=>{
 const f=fixture(),oid=f.add('missing');let release;const wait=new Promise(r=>{release=r;});
 f.edit(async()=>{await wait;throw Error('OFFLINE_FAILED');});
 const a=f.read(oid),b=f.read(oid);const results=Promise.allSettled([a,b]);await new Promise(r=>setImmediate(r));release();
 assert.deepEqual((await results).map(x=>x.status),['rejected','rejected']);assert.equal(f.calls.length,1);
 assert.equal(f.m.gitBlobOwnerFacts(f.owner).entries,0);assert.equal(f.m.gitBlobOwnerFacts(f.owner).pending,0);
});
test('native standalone source view keeps ordinary verified GET behavior',async()=>{
 entry();const bytes=Buffer.from('native'),v=raw(bytes);let calls=0;
 const api=async()=>{calls++;return {data:structuredClone(v)};};
 await native.sourceView(api,context).blob(v.sha);await native.sourceView(api,context).blob(v.sha);assert.equal(calls,2);
});

test('fresh native tree inventories are re-read even when all referenced blob bytes hit',async()=>{
 const m=entry(),owner=m.createGitBlobOwner(repository),bytes=Buffer.from('immutable'),b=raw(bytes);
 const inventory=new Map([['package.json',{sha:b.sha,mode:'100644',bytes}]]),tree=preparation.treeOid(inventory);
 let trees=0,blobs=0,changed=false;
 const api=async(method,route)=>{
  assert.equal(method,'GET');
  if(route.includes('/git/trees/')){trees++;return {data:{sha:tree,truncated:false,tree:[{path:'package.json',type:'blob',mode:changed?'100755':'100644',sha:b.sha}]}};}
  blobs++;return {data:structuredClone(b)};
 };
 m.bindGitBlobOwner(api,owner);
 assert.equal((await native.sourceView(api,context).tree(tree)).get('package.json').bytes.toString(),'immutable');
 changed=true;await assert.rejects(native.sourceView(api,context).tree(tree));assert.equal(trees,2);assert.equal(blobs,1);
});
test('fixed CODE read aliases keep the same opaque owner while retaining their own mutable reads',async()=>{
 const f=fixture(),oid=f.add('alias');await f.read(oid);let forwarded=0;
 const read=async(...args)=>{forwarded++;return f.api(...args);};f.m.inheritGitBlobRead(read,f.api);
 assert.equal((await native.sourceView(read,context).blob(oid)).toString(),'alias');assert.equal(forwarded,0);assert.equal(f.calls.length,1);
 assert.throws(()=>f.m.bindGitBlobOwner(read,f.m.createGitBlobOwner(repository)));
});

for(const method of ['commit','tree','blob'])for(const [label,change] of [
 ['foreign repository',r=>r.full_name='foreign/library'],
 ['missing repository name',r=>delete r.full_name],
 ['string repository id',r=>r.id='123'],
 ['fractional repository id',r=>r.id=1.5],
])test('extracted native '+method+' preserves '+label+' refusal before any request',async()=>{
 const bytes=Buffer.from('native repository boundary'),value=raw(bytes),repo={...repository};change(repo);let calls=0;
 const api=async()=>{calls++;return {data:structuredClone(value)};};
 await assert.rejects(async()=>native.sourceView(api,{repository:repo})[method](value.sha),{code:'repository'});
 assert.equal(calls,0,'native scope refusal must precede provider IO');
});
