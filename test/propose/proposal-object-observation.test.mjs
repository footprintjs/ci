import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import native from '../../src/guards/release-github.cjs';
import preparation from '../../src/guards/release-prepare.cjs';
import {sourceFixture} from './prepared-fixtures.mjs';
import {proposerFixture} from './proposer-provider-fixture.mjs';
const objects=await import('../../src/propose/proposal-object-observation.mjs').catch(()=>({}));
const PRIVATE='PRIVATE-PROPOSAL-OBJECT-BODY',head='c'.repeat(40),content='prepared blob λ\n',blobSha=preparation.gitObject('blob',Buffer.from(content));
function fixture(change=()=>{}){
 const target=new Map(sourceFixture().inventory);let f,objectReads=0;
 const setup=proposerFixture({extra:path=>{
  const url=new URL('https://offline.invalid'+path),p=url.pathname;let raw;
  if(p.includes('/git/blobs/')){
   const sha=p.split('/').at(-1),row=sha===blobSha?{bytes:Buffer.from(content)}:[...target.values()].find(r=>r.sha===sha);assert.ok(row,'known synthetic blob');
   raw={sha,encoding:'base64',size:row.bytes.length,content:row.bytes.toString('base64'),private:PRIVATE};
  }else if(p.includes('/git/trees/'))raw={sha:f.prepared.targetTree,truncated:false,tree:[...target].map(([path,row])=>({path,mode:row.mode,type:'blob',sha:row.sha})),private:PRIVATE};
  else if(p.endsWith('/commits/'+head))raw={sha:head,parents:f.prepared.proposedParents.map(sha=>({sha})),
   author:{id:500,login:setup.settings.slug+'[bot]',type:'Bot'},committer:{id:500,login:setup.settings.slug+'[bot]',type:'Bot'},
   commit:{tree:{sha:f.prepared.targetTree},verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE},message:PRIVATE},private:PRIVATE};
  else return undefined;
  objectReads++;return raw;
 },change:(raw,path,counts)=>change(raw,path,counts)});
 f=setup;
 for(const [path,text] of Object.entries(f.prepared.prepared.updates)){const bytes=Buffer.from(text);target.set(path,{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});}
 for(const path of f.prepared.prepared.deletions)target.delete(path);
 assert.equal(preparation.treeOid(target),f.prepared.targetTree);
 return {...f,target,objectReads:()=>objectReads};
}
function reader(f){
 assert.equal(typeof objects.createFoottraceProposalObjectReader,'function','native proposal object observer absent');
 return objects.createFoottraceProposalObjectReader({transport:f.transport,context:f.context});
}
test('native source reader exposes the SAME bounded blob/tree decoder for verification',async()=>{
 const calls=[],repo={id:123,full_name:'footprintjs/foottrace'},inventory=new Map([['a.txt',{mode:'100644',sha:blobSha}]]),tree=preparation.treeOid(inventory);
 const view=native.sourceView(async(method,path)=>{assert.equal(method,'GET');calls.push(path);return {data:path.includes('/blobs/')?
  {sha:blobSha,encoding:'base64',size:Buffer.byteLength(content),content:Buffer.from(content).toString('base64')}:
  {sha:tree,truncated:false,tree:[{path:'a.txt',mode:'100644',type:'blob',sha:blobSha}]}};},{repository:repo});
 assert.equal(typeof view.blob,'function','shared native blob decoder absent');assert.equal(typeof view.tree,'function','shared native tree decoder absent');
 assert.deepEqual(await view.blob(blobSha),Buffer.from(content));const actual=await view.tree(tree);assert.equal(actual.get('a.txt').sha,blobSha);
 assert.equal(calls.length,2);
});
test('blob observation reuses SAME-owner verified bytes across fresh views without creation attribution',async()=>{
 const f=fixture(),r=await reader(f).blob({content,encoding:'utf-8'});
 assert.equal(r.valid,true);assert.equal(r.scope,'proposal-object-observation-only');assert.equal(r.object.kind,'blob');assert.equal(r.object.sha,blobSha);
 assert.equal(r.object.bytes,Buffer.byteLength(content));assert.equal(r.object.contentDigest,createHash('sha256').update(content).digest('hex'));
 const again=await reader(f).blob({content,encoding:'utf-8'});assert.deepEqual(again,r);
 assert.equal(f.objectReads(),1,'immutable bytes verified once and reused only on this SAME owner');assert.equal(r.originalProducerAttributed,false);assert.equal(r.submissionAcknowledged,false);assert.equal(r.authorized,false);
 assert.equal(JSON.stringify(r).includes(content),false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('complete target tree is recomputed through native decoder; its paths stay outside the result',async()=>{
 const f=fixture(),r=await reader(f).tree(f.prepared);assert.equal(r.valid,true);assert.equal(r.object.kind,'tree');
 assert.equal(r.object.sha,f.prepared.targetTree);assert.equal(r.object.entries,f.target.size);
 assert.equal(f.seen.filter(x=>x.path.includes('/git/trees/')).length,2);
 assert.equal(JSON.stringify(r).includes('package.json'),false);assert.equal(r.authorized,false);
});
test('new signed App commit uses native current identity and exact target plus ordered M/P without a fabricated pending PR',async()=>{
 const f=fixture(),r=await reader(f).commit(f.prepared,{sha:head});assert.equal(r.valid,true);assert.equal(r.object.kind,'commit');
 assert.equal(r.object.head,head);assert.equal(r.object.tree,f.prepared.targetTree);assert.deepEqual(r.object.parents,f.prepared.proposedParents);
 assert.equal(r.object.botId,500);assert.equal(r.object.verified,true);assert.equal(r.object.reason,'valid');
 assert.equal(f.objectReads(),2);assert.equal(f.seen.some(x=>x.path.includes('/pulls')),false);
 assert.equal(r.authorized,false);assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.originalProducerAttributed,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
for(const [name,edit] of [
 ['blob identity',d=>d.sha='f'.repeat(40)],['blob length',d=>d.size++],['blob bytes',d=>d.content=Buffer.from('other').toString('base64')],['blob encoding',d=>d.encoding='utf-8']
])test('blob '+name+' mismatch refuses observed data',async()=>{
 const f=fixture((d,p)=>{if(p.includes('/git/blobs/'))edit(d);});assert.equal((await reader(f).blob({content,encoding:'utf-8'})).valid,false);
});
for(const [name,edit] of [
 ['truncation',d=>d.truncated=true],['missing entry',d=>d.tree.pop()],['duplicate path',d=>d.tree.push(d.tree[0])],['unsupported mode',d=>d.tree[0].mode='160000']
])test('target tree '+name+' refuses complete-tree observation',async()=>{
 const f=fixture((d,p)=>{if(p.includes('/git/trees/'))edit(d);});assert.equal((await reader(f).tree(f.prepared)).valid,false);
});
for(const [name,edit] of [
 ['unsigned',d=>d.commit.verification.verified=false],['wrong reason',d=>d.commit.verification.reason='unsigned'],
 ['foreign actor',d=>d.author.id++],['actor display only',d=>{d.committer=null;}],['target tree',d=>d.commit.tree.sha='f'.repeat(40)],
 ['ordered parents',d=>d.parents.reverse()],['foreign login',d=>d.author.login='foreign[bot]'],
 ['truthy verification',d=>d.commit.verification.verified='true'],['empty parents',d=>d.parents=[]],
 ['foreign head',d=>d.sha='f'.repeat(40)]
])test('new commit '+name+' cannot become a valid signed observation',async()=>{
 const f=fixture((d,p)=>{if(p.endsWith('/commits/'+head))edit(d);});assert.equal((await reader(f).commit(f.prepared,{sha:head})).valid,false);
});
test('a completed current producer refuses before the new commit is read',async()=>{
 const f=fixture((d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}});
 assert.equal((await reader(f).commit(f.prepared,{sha:head})).valid,false);assert.equal(f.objectReads(),0);
});
test('later current producer drift after first commit GET refuses instead of using earlier identity',async()=>{
 let after=false;const f=fixture((d,p)=>{if(p.endsWith('/commits/'+head))after=true;
  if(after&&p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}});
 assert.equal((await reader(f).commit(f.prepared,{sha:head})).valid,false);assert.equal(f.objectReads(),1);
});
test('JSON owner cannot supply provider, current identity or writer authority',()=>{
 assert.equal(typeof objects.createFoottraceProposalObjectReader,'function');
 assert.throws(()=>objects.createFoottraceProposalObjectReader({transport:{scope:'captured-native-http-owner'},context:{}}));
});

test('native decoder refuses a correctly hashed blob over its two-MiB bound',async()=>{
 const bytes=Buffer.alloc(2*1024*1024+1,120),sha=preparation.gitObject('blob',bytes);
 const view=native.sourceView(async()=>({data:{sha,encoding:'base64',size:bytes.length,content:bytes.toString('base64')}}),
  {repository:{id:123,full_name:'footprintjs/foottrace'}});
 assert.equal(typeof view.blob,'function');await assert.rejects(()=>view.blob(sha));
});
test('target tree cannot borrow semantic bytes that disagree with their unchanged blob OID',async()=>{
 const f=fixture((d,p)=>{if(p.includes('/git/blobs/'))d.content=Buffer.alloc(d.size,120).toString('base64');});
 assert.equal((await reader(f).tree(f.prepared)).valid,false);
});
test('current producer drift after the LAST new-commit GET cannot escape the final recheck',async()=>{
 let reads=0,after=false;const f=fixture((d,p)=>{
  if(p.endsWith('/commits/'+head)&&++reads===2)after=true;
  if(after&&p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}
 });
 assert.equal((await reader(f).commit(f.prepared,{sha:head})).valid,false);assert.equal(f.objectReads(),2);
});
test('tree observation refuses source context substitution before provider IO',async()=>{
 const f=fixture();assert.equal((await reader(f).tree({...f.prepared,sourceSha:'f'.repeat(40)})).valid,false);
 assert.equal(f.objectReads(),0);
});
test('matching arbitrary provider parents cannot substitute the native ordered current-M/pending-P join',async()=>{
 const wrong=['f'.repeat(40),'a'.repeat(40)],f=fixture((d,p)=>{if(p.endsWith('/commits/'+head))d.parents=wrong.map(sha=>({sha}));});
 assert.equal((await reader(f).commit({...f.prepared,proposedParents:wrong},{sha:head})).valid,false);
 assert.equal(f.objectReads(),0);
});
