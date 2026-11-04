import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparedSourceReader} from '../../src/propose/prepared-source.mjs';
import {prepareFixture} from './prepared-fixtures.mjs';
import preparation from '../../src/guards/release-prepare.cjs';
import {createFoottraceOrdinaryPreparationReader} from '../../src/propose/foottrace-ordinary-preparation.mjs';
import {ordinaryFixture,PRIVATE} from './ordinary-provider-fixture.mjs';
const read=f=>createFoottraceOrdinaryPreparationReader(f)(f.prepared);
test('actual native Git sources reconstruct every ordinary pending hop and current preparation',async()=>{
 const f=ordinaryFixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'native-ordinary-preparation-only');assert.equal(r.references.length,2);
 assert.equal(r.references.at(-1).sourceSha,f.context.sha);assert.equal(r.references.at(-1).targetTree,f.prepared.targetTree);
 assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.privateAppIdentityAdmitted,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes('content'),false);
 assert.ok(f.calls.every(p=>!p.includes('/contents/')&&!p.includes('/compare/')&&!p.includes('/actions/')));
});
test('eight pending witnesses and M are all independently source-bound',async()=>{
 const f=ordinaryFixture({count:8}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.references.length,9);
 for(const ref of f.prepared.preparationRefs)assert.ok(f.calls.some(p=>p.endsWith('/git/commits/'+ref.sourceSha)));
});
for(const [name,change] of [
 ['moving current main',(d,p)=>{if(p.endsWith('/heads/main'))d.object.sha='f'.repeat(40);}],
 ['wrong source commit',(d,p)=>{if(p.includes('/git/commits/'))d.sha='f'.repeat(40);}],
 ['wrong Git source tree',(d,p)=>{if(p.includes('/git/commits/'))d.tree.sha='f'.repeat(40);}],
 ['truncated inventory',(d,p)=>{if(p.includes('/git/trees/'))d.truncated=true;}],
 ['missing unrelated path',(d,p)=>{if(d.tree instanceof Array)d.tree=d.tree.filter(r=>r.path!=='src/unchanged.ts');}],
 ['wrong blob identity',(d,p)=>{if(p.includes('/git/blobs/'))d.sha='f'.repeat(40);}],
 ['wrong blob bytes',(d,p)=>{if(p.includes('/git/blobs/'))d.content=Buffer.from('substitution').toString('base64');}],
 ['changed immutable date',(d,p)=>{if(p.includes('/git/commits/'))d.committer.date='2026-11-03T01:00:00Z';}],
 ['coherent source date drift between adjacent reads',(d,p,n)=>{if(p.includes('/git/commits/')&&n.mains>2)d.committer.date='2026-11-03T01:00:00Z';}],
])test(name+' holds native ordinary source admission',async()=>{const r=await read(ordinaryFixture({change}));assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);});
test('private provider fields cannot change the owned source binding',async()=>{
 const a=await read(ordinaryFixture()),b=await read(ordinaryFixture({change:d=>{d.private='other-private-body';}}));assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.digest,b.digest);
});
test('an HTTP failure remains unavailable and never becomes an empty intent namespace',async()=>{
 const r=await read(ordinaryFixture({change:(d,p)=>{if(p.includes('/git/trees/'))throw new Error(PRIVATE);}}));assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('an actual malformed native intent is not relabelled ordinary',async()=>{
 const f=ordinaryFixture({changeSource:s=>{const bytes=Buffer.from('{}\n');s.inventory.set('.release/recovery/1.10.0/001.json',{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});}});
 assert.equal((await read(f)).valid,false);
});
for(const key of ['version','targetTree','sourceTree'])test('current '+key+' claim cannot replace native reconstruction',async()=>{
 const f=ordinaryFixture();f.prepared={...f.prepared,[key]:key==='version'?'9.9.9':'f'.repeat(40)};assert.equal((await read(f)).valid,false);
});
test('a pending-hop declared version cannot replace its actual source queue',async()=>{
 const f=ordinaryFixture();f.prepared={...f.prepared,preparationRefs:f.prepared.preparationRefs.map(r=>({...r,version:'9.9.9'}))};assert.equal((await read(f)).valid,false);
});

function addIntent(source,version) {
 const repository={id:123,full_name:'footprintjs/foottrace'},lineage={pr:40,head:'1'.repeat(40),tree:'2'.repeat(40),merge:'3'.repeat(40)};
 const bytes=preparation.intentBytes({schema:1,kind:'unpublished-recovery',package:'foottrace',version,sequence:1,repository,
  base:{sha:'a'.repeat(40),tree:source.commit.tree.sha},origin:lineage,predecessor:lineage,previous:null,queuedFragments:preparation.fragmentQueue(source.inventory)},repository);
 source.inventory.set(preparation.intentPath(version,1),{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});
}
test('a structurally valid active recovery namespace cannot be admitted as ordinary preparation',async()=>{
 const f=ordinaryFixture({changeSource:source=>addIntent(source,'1.10.0')});const r=await read(f);assert.equal(r.valid,false);assert.equal(r.reason,'ordinary-active-recovery');
});
test('an admitted historical old-version intent stays data and does not change ordinary current kind',async()=>{
 const f=ordinaryFixture({changeSource:source=>addIntent(source,'1.9.0')}),r=await read(f);assert.equal(r.valid,true);assert.ok(r.references.every(ref=>ref.archivedIntentRecords===1));
});

test('a later larger queue keeps old raw fragments and derives its own native version',async()=>{
 const f=ordinaryFixture({count:2,changeSource:(source,i)=>{if(i===0)return;const bytes=Buffer.from('---\ntype: added\nbump: minor\n---\n\n- Additional change.\n');
 source.inventory.set('.changes/second.md',{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});}});
 const r=await read(f);assert.equal(r.valid,true);assert.equal(r.references[0].version,'1.10.1');assert.equal(r.references.at(-1).version,'1.11.0');
});
test('native source base version cannot be replaced by a declared prepared claim',async()=>{
 const f=ordinaryFixture();f.prepared={...f.prepared,fromVersion:'9.9.9'};assert.equal((await read(f)).valid,false);
});
test('a pending-hop preparation date remains tied to its immutable native source',async()=>{
 const f=ordinaryFixture();f.prepared={...f.prepared,preparationRefs:f.prepared.preparationRefs.map(ref=>({...ref,preparationDate:'2026-11-03'}))};assert.equal((await read(f)).valid,false);
});
test('matching target tree does not admit a different prepared payload',async()=>{
 const f=ordinaryFixture();f.prepared={...f.prepared,prepared:{...f.prepared.prepared,notes:'unbound notes'}};assert.equal((await read(f)).valid,false);
});
test('final main movement is refused at the last current-main boundary',async()=>{
 const f=ordinaryFixture({change:(d,p,n)=>{if(p.endsWith('/heads/main')&&n.mains===4)d.object.sha='f'.repeat(40);}});
 assert.equal((await read(f)).valid,false);
});
test('individually coherent native source references cannot hide loss of an older raw fragment',async()=>{
 const f=ordinaryFixture({count:2}),second=f.pending.witnesses[1].originalSource,bytes=Buffer.from('---\ntype: fixed\nbump: patch\n---\n\n- Replacement fragment.\n');
 for(const source of [second,f.currentSource]){
  source.inventory.delete('.changes/first.md');source.inventory.set('.changes/replacement.md',{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});source.commit.tree.sha=preparation.treeOid(source.inventory);
 }
 const reconstruct=createPreparedSourceReader({packageName:'foottrace',dateLaw:'source-committer-day',prepare:prepareFixture}),current=reconstruct(f.currentSource);assert.equal(current.valid,true);
 f.prepared={...f.prepared,sourceTree:current.sourceTree,targetTree:current.tree,version:current.prepared.version,prepared:current.prepared,
  preparationRefs:f.prepared.preparationRefs.map(ref=>{const actual=reconstruct(f.sources.get(ref.sourceSha));assert.equal(actual.valid,true);return {...ref,sourceTree:actual.sourceTree,pendingTree:actual.tree,preparationDate:actual.date,version:actual.prepared.version};})};
 assert.equal((await read(f)).valid,false);
});
