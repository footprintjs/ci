import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
const module=await import('../../src/propose/proposal-bootstrap.mjs').catch(()=>({}));
async function run(f,extra={}){
 assert.equal(typeof module.runFoottraceProposalBootstrapInspection,'function');
 const invocation=f.makeInvocation(),r=await module.runFoottraceProposalBootstrapInspection({...invocation,...extra});
 return {r,invocation};
}
test('trusted CODE host/source/workflow/entry and current private producer share one captured read client',async()=>{
 const f=await proposalBootstrapFixture(),{r,invocation}=await run(f);
 assert.equal(r.status,'proposal-bootstrap-only');assert.equal(r.record.complete,true);
 assert.equal(r.backend.context.sha,f.M);assert.equal(r.backend.sourceBinding.reference.sourceTree,f.current.commit.tree.sha);
 assert.equal(r.backend.current.identity.runId,500);assert.equal(r.backend.transport.scope,'captured-native-read-owner');assert.equal(Object.hasOwn(r.backend.transport,'readOnly'),false);
 assert.equal('APP_PRIVATE_KEY' in invocation.env,false);assert.equal('GH_TOKEN' in invocation.env,false);
 assert.equal(invocation.env.UNREAD_OTHER,PRIVATE);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
 assert.equal(r.report.writerCredentialBindingAdmitted,false);
 assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes('BEGIN PRIVATE KEY'),false);
});
for(const [label,changeEnv] of [
 ['job',e=>{e.GITHUB_JOB='other';}],
 ['source alias',e=>{e.GITHUB_SHA='f'.repeat(40);}],
 ['workflow source',e=>{e.GITHUB_WORKFLOW_SHA='f'.repeat(40);}],
 ['repository',e=>{e.GITHUB_REPOSITORY_ID='999';}],
 ['attempt',e=>{e.GITHUB_RUN_ATTEMPT='2';}],
 ['workflow ref',e=>{e.GITHUB_WORKFLOW_REF='other/repo/.github/workflows/publish.yml@refs/heads/main';}],
 ['tool pin',e=>{e.TOOL_SHA='bad';}],
 ['opaque token',e=>{e.GH_TOKEN='bad\ntoken';}]
])test('invalid actual '+label+' is refused before HTTP and still removes credential fields',async()=>{
 const f=await proposalBootstrapFixture({changeEnv}),{r,invocation}=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.length,0);
 assert.equal('APP_PRIVATE_KEY' in invocation.env,false);assert.equal('GH_TOKEN' in invocation.env,false);
});
test('saved/model host profiles lack the required CODE ports and cannot establish a source binding',async()=>{
 const f=await proposalBootstrapFixture(),{r}=await run(f,{host:{readProfile:{trusted:true},readSource:{sourceSha:f.M},requireClean:true}});
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.length,0);
});
test('dirty or substituted local current entry bytes stay held, not trusted from readable HEAD alone',async()=>{
 for(const options of [{dirty:true},{changeSource:s=>{s.files.entry=Buffer.from(PRIVATE);}},{changeSource:s=>{s.files.entry[0]^=1;}},{changeSource:s=>{s.sourceTree='f'.repeat(40);}}]){
  const f=await proposalBootstrapFixture(options),{r}=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
  assert.equal(JSON.stringify(r.record).includes(PRIVATE),false);
 }
});
test('a profile cannot pin changed candidate workflow or entry data into the independently admitted M source',async()=>{
 for(const key of ['workflow','entry','profile']){
  const f=await proposalBootstrapFixture({changeProfile:p=>{p[key].sha='f'.repeat(40);}}),{r}=await run(f);
  assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 }
});
test('profile/tool identity and the whole immutable source tree must agree',async()=>{
 for(const changeProfile of [p=>{p.toolSha='f'.repeat(40);},p=>{p.sourceSha='f'.repeat(40);},p=>{p.workflow.mode='100755';},p=>{p.entry.mode='100755';}]){
  const f=await proposalBootstrapFixture({changeProfile}),{r}=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
 }
});
test('completed current producer remains held even when host source and App key match',async()=>{
 const f=await proposalBootstrapFixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}}),{r}=await run(f);
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(r.report.authorized,false);
});
test('an incomplete native record discards the opaque client and all host/source observations',async()=>{
 const f=await proposalBootstrapFixture(),{r}=await run(f,{recordLimitBytes:256});
 assert.equal(r.status,'incomplete');assert.equal(r.backend===null,true);
});

test('credentials are removed before the first CODE host call and first provider acquisition',async()=>{
 const f=await proposalBootstrapFixture(),invocation=f.makeInvocation(),original=invocation.fetcher,clean=invocation.host.requireClean;let requests=0,checks=0;
 const host={...invocation.host,requireClean:()=>{
  checks++;assert.equal('APP_PRIVATE_KEY' in invocation.env,false);assert.equal('GH_TOKEN' in invocation.env,false);return clean();
 }};
 const fetcher=async(...args)=>{
  requests++;assert.equal('APP_PRIVATE_KEY' in invocation.env,false);assert.equal('GH_TOKEN' in invocation.env,false);return original(...args);
 };
 const r=await module.runFoottraceProposalBootstrapInspection({...invocation,host,fetcher});
 assert.equal(r.status,'proposal-bootstrap-only');assert.ok(requests>0);assert.ok(checks>0);
});
test('the captured repository credential cannot be replaced through a later environment edit',async()=>{
 const f=await proposalBootstrapFixture(),invocation=f.makeInvocation(),original=invocation.fetcher;let requests=0;
 const fetcher=async(...args)=>{if(++requests===1)invocation.env.GH_TOKEN='different_later_token';return original(...args);};
 const r=await module.runFoottraceProposalBootstrapInspection({...invocation,fetcher});
 assert.equal(r.status,'proposal-bootstrap-only');assert.equal(r.report.authorized,false);delete invocation.env.GH_TOKEN;
});
test('a later stable configured-App identity cannot replace the immediately prior identity',async()=>{
 let appReads=0,f;f=await proposalBootstrapFixture({changeHttp:(response,url)=>{
  if(new URL(url).pathname==='/app'&&++appReads>=3)
   return Response.json({id:701,slug:f.f.options.settings.slug,client_id:f.f.options.settings.clientId});
 }});
 const {r}=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'proposal-bootstrap-drift');assert.equal(r.backend===null,true);
});
test('a late dirty local source cannot reuse its earlier matching profile snapshot',async()=>{
 const f=await proposalBootstrapFixture();let checks=0;
 f.host.requireClean=()=>{if(++checks===5)throw new Error(PRIVATE);};
 const {r}=await run(f);assert.equal(r.status,'held');assert.equal(r.report.reason,'proposal-bootstrap-drift');assert.equal(r.backend===null,true);
});
test('a saved PROFILE_JSON field cannot supply the CODE host or writer authority',async()=>{
 const f=await proposalBootstrapFixture({changeEnv:e=>{e.PROFILE_JSON=JSON.stringify({authorized:true,sourceSha:e.SOURCE_SHA});}});
 const {r}=await run(f,{host:null});assert.equal(r.status,'held');assert.equal(f.calls.length,0);assert.equal(r.backend===null,true);
});

test('an extra profile blob must have coherent native size metadata as well as correct bytes',async()=>{
 let f;f=await proposalBootstrapFixture({change:(d,p)=>{
  if(p.endsWith('/git/blobs/'+f.host.readProfile().profile.sha))d.size++;
 }});
 const {r}=await run(f);assert.equal(r.status,'held');assert.equal(r.backend===null,true);
});

test('the whole bootstrap shares one hard acquisition budget across every bounded view',async()=>{
 const f=await proposalBootstrapFixture(),{r}=await run(f,{limits:{requests:1,totalBytes:128*1024*1024}});
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);assert.equal(f.calls.length,1);
});
test('returned local source identity getters are rejected without invoking host data accessors',async()=>{
 const f=await proposalBootstrapFixture(),read=f.host.readSource;let invoked=false;
 f.host.readSource=()=>{const s=read();Object.defineProperty(s,'sourceSha',{enumerable:true,get(){invoked=true;return f.M;}});return s;};
 const {r}=await run(f);assert.equal(r.status,'held');assert.equal(invoked,false);assert.equal(r.backend===null,true);
});
test('local CODE source bytes are detached before any provider await can retarget the observed input',async()=>{
 const f=await proposalBootstrapFixture(),invocation=f.makeInvocation(),read=invocation.host.readSource,fetcher=invocation.fetcher;let local=null,needsRestore=false;
 const host={...invocation.host,readSource:()=>{local=read();local.files.entry[0]^=1;needsRestore=true;return local;}};
 const acquire=async(...args)=>{if(needsRestore){needsRestore=false;local.files.entry[0]^=1;}return fetcher(...args);};
 const r=await module.runFoottraceProposalBootstrapInspection({...invocation,host,fetcher:acquire});
 assert.equal(r.status,'held');assert.equal(r.backend===null,true);
});

test('inspection can observe a non-writable repository without admitting writer authority or retaining JWT bytes',async()=>{
 const f=await proposalBootstrapFixture({change:(d,p)=>{if(p==='/repos/footprintjs/foottrace')d.permissions.push=false;}});
 const invocation=f.makeInvocation(),jwt=invocation.env.APP_JWT;
 const r=await module.runFoottraceProposalBootstrapInspection(invocation);
 assert.equal(r.status,'proposal-bootstrap-only');assert.equal(r.report.writerCredentialBindingAdmitted,false);assert.equal(r.report.authorized,false);
 assert.equal(Object.hasOwn(invocation.env,'APP_JWT'),false);assert.equal(JSON.stringify(r.record).includes(jwt),false);
});
test('accidental private-key input to inspection is refused and all credential fields are erased before IO',async()=>{
 const f=await proposalBootstrapFixture({changeEnv:e=>{e.APP_PRIVATE_KEY='PRIVATE-FORBIDDEN';}});
 const {r,invocation}=await run(f);assert.equal(r.status,'held');assert.equal(f.calls.length,0);
 for(const key of ['APP_PRIVATE_KEY','APP_JWT','GH_TOKEN'])assert.equal(Object.hasOwn(invocation.env,key),false);
});
