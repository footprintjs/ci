import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createFoottraceCurrentPreparationReader} from '../../src/propose/current-preparation.mjs';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {proposerFixture} from './proposer-provider-fixture.mjs';
import {zip} from './artifact-fixture.mjs';
const PRIVATE='PRIVATE-CURRENT-ARCHIVE-ERROR';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture({change=()=>{},proposalChange=()=>{},manifestChange=()=>{},identityChange=()=>{}}={}) {
 const f=proposerFixture({change:identityChange}),artifactId=800,calls=[];
 const identityReader=createFoottraceProposerReader(f),ctx=f.context,p=f.prepared;
 const manifest={repositoryId:ctx.repository.id,runId:500,runAttempt:1,jobId:600,sourceSha:ctx.sha,tree:p.sourceTree,package:'foottrace',version:p.version};
 manifestChange(manifest);
 const proposal={base:ctx.sha,tree:p.sourceTree,repository:ctx.repository,prepared:structuredClone(p.prepared)};proposalChange(proposal);
 const archive=zip([['manifest.json',JSON.stringify(manifest)+'\n'],['proposal.json',JSON.stringify(proposal)+'\n']]);
 const metadata={id:artifactId,name:'foottrace-'+ctx.repository.id+'-500-1-prepare',expired:false,size_in_bytes:archive.length,digest:'sha256:'+hash(archive),
  workflow_run:{id:500,head_sha:ctx.sha,repository_id:ctx.repository.id,head_repository_id:ctx.repository.id},private:PRIVATE};
 let metadataReads=0;
 const api=async(method,route,body)=>{
  assert.equal(method,'GET');assert.equal(body,undefined);calls.push(route);let data;
  if(route.endsWith('/actions/artifacts/800')){metadataReads++;data=structuredClone(metadata);}
  else if(route.endsWith('/actions/artifacts/800/zip'))data=Buffer.from(archive);
  else if(route.endsWith('/actions/runs/500'))data={id:500,run_attempt:1,head_sha:ctx.sha,repository:ctx.repository,head_repository:ctx.repository,path:'.github/workflows/publish.yml',head_branch:'main',event:'push',status:'in_progress',conclusion:null};
  else if(route.includes('/attempts/1/jobs?'))data={total_count:2,jobs:[
   {id:600,name:'prepare',run_id:500,run_attempt:1,head_sha:ctx.sha,status:'completed',conclusion:'success'},
   {id:601,name:'proposal',run_id:500,run_attempt:1,head_sha:ctx.sha,status:'in_progress',conclusion:null}]};
  else throw new Error('unexpected fixture route');
  const changed=change(data,route,{metadataReads});return {data:changed===undefined?data:changed};
 };
 return {...f,api,artifactId,calls,archive,manifest,proposal,readCurrentProposer:identityReader};
}
async function read(f) {const identity=await f.readCurrentProposer(f.prepared);return createFoottraceCurrentPreparationReader(f)(f.prepared,identity);}
test('current prepare archive binds actual native producer, ZIP bytes and the whole reconstructed proposal twice',async()=>{
 const f=fixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'current-preparation-archive-only');
 assert.equal(r.reference.artifactId,800);assert.equal(r.reference.jobId,600);assert.equal(r.reference.archiveDigest,hash(f.archive));
 assert.equal(r.reference.sourceSha,f.prepared.sourceSha);assert.equal(r.reference.targetTree,f.prepared.targetTree);
 assert.equal(f.calls.filter(p=>p.endsWith('/zip')).length,2);assert.equal(r.authorized,false);assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.retainedEligibilityAdmitted,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes('manifest.json'),false);
});
for(const [name,change] of [
 ['expired artifact',(d,p)=>{if(p.endsWith('/800'))d.expired=true;}],
 ['wrong artifact ID',(d,p)=>{if(p.endsWith('/800'))d.id=801;}],
 ['wrong artifact name',(d,p)=>{if(p.endsWith('/800'))d.name='other';}],
 ['wrong run-linked source',(d,p)=>{if(p.endsWith('/800'))d.workflow_run.head_sha='f'.repeat(40);}],
 ['wrong repository',(d,p)=>{if(p.endsWith('/800'))d.workflow_run.repository_id=999;}],
 ['wrong byte size',(d,p)=>{if(p.endsWith('/800'))d.size_in_bytes++;}],
 ['wrong provider archive digest',(d,p)=>{if(p.endsWith('/800'))d.digest='sha256:'+'f'.repeat(64);}],
 ['failed actual prepare',(d,p)=>{if(d.jobs)d.jobs[0].conclusion='failure';}],
 ['completed historical run',(d,p)=>{if(p.endsWith('/runs/500')){d.status='completed';d.conclusion='success';}}],
 ['ZIP member bytes changed',(d,p)=>{if(Buffer.isBuffer(d)){d[d.length-1]^=1;}}],
 ['adjacent artifact digest drift',(d,p,n)=>{if(p.endsWith('/800')&&n.metadataReads===2)d.digest='sha256:'+'f'.repeat(64);}],
])test(name+' holds current archive admission',async()=>{const r=await read(fixture({change}));assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);});
for(const [name,proposalChange] of [
 ['different proposal source',p=>p.base='f'.repeat(40)],
 ['different proposal prepared version',p=>p.prepared.version='9.9.9'],
 ['different raw-fragment consumption',p=>p.prepared.deletions=[]],
 ['unowned proposal field',p=>p.private=PRIVATE],
])test(name+' is not the source reconstruction',async()=>{const r=await read(fixture({proposalChange}));assert.equal(r.valid,false);});
test('a valid archive with a wrong current attempt manifest is refused',async()=>{assert.equal((await read(fixture({manifestChange:m=>m.runAttempt=2}))).valid,false);});
test('HTTP failure is unavailable, with no private error body retained',async()=>{const r=await read(fixture({change:(d,p)=>{if(p.endsWith('/800'))throw new Error(PRIVATE);}}));assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);});
test('fresh current identity drift cannot be replaced by an earlier saved identity',async()=>{const f=fixture(),identity=await f.readCurrentProposer(f.prepared);
 f.readCurrentProposer=async()=>({...identity,identity:{...identity.identity,proposalJobId:602}});
 const r=await createFoottraceCurrentPreparationReader(f)(f.prepared,identity);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('current identity failure prevents downloading any archive',async()=>{const f=fixture();f.readCurrentProposer=async()=>({valid:false,nativeReason:'current-run-status'});
 const r=await createFoottraceCurrentPreparationReader(f)(f.prepared,{valid:false});assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('a missing optional provider digest still binds actual bytes, without claiming provider digest authentication',async()=>{
 const f=fixture({change:(d,p)=>{if(p.endsWith('/800'))delete d.digest;}}),r=await read(f);
 assert.equal(r.valid,true);assert.equal(r.reference.archiveDigest,hash(f.archive));assert.equal(r.providerDigestPresent,false);
});

test('fresh identity must still hold after actual archive admission',async()=>{
 const f=fixture(),read=f.readCurrentProposer;f.readCurrentProposer=async prepared=>f.calls.some(route=>route.endsWith('/zip'))?{valid:false,nativeReason:'current-run-status'}:read(prepared);
 const r=await readCurrent(f);assert.equal(r.valid,false);assert.equal(f.calls.filter(p=>p.endsWith('/800')).length,1);
});
async function readCurrent(f){const identity=await f.readCurrentProposer(f.prepared);return createFoottraceCurrentPreparationReader(f)(f.prepared,identity);}
test('coherent adjacent archive byte drift remains a hold even with an unchanged reconstructed proposal',async()=>{
 let f,alternate;
 f=fixture({change:(d,path,n)=>{
  if(n.metadataReads!==2)return;
  alternate??=zip([['manifest.json',JSON.stringify({...f.manifest,unowned:'different-bytes'})+'\n'],['proposal.json',JSON.stringify(f.proposal)+'\n']]);
  if(path.endsWith('/800')){d.size_in_bytes=alternate.length;d.digest='sha256:'+hash(alternate);}
  if(path.endsWith('/zip'))return alternate;
 }});
 assert.equal((await read(f)).valid,false);
});
test('declared oversized current archive is refused before any download',async()=>{
 const f=fixture({change:(d,p)=>{if(p.endsWith('/800'))d.size_in_bytes=20*1024*1024+1;}});
 assert.equal((await read(f)).valid,false);assert.equal(f.calls.some(p=>p.endsWith('/zip')),false);
});

test('coherent archive/native prepare job substitution cannot replace the independently observed current prepare job',async()=>{
 const f=fixture({manifestChange:m=>m.jobId=602,change:d=>{if(d.jobs)d.jobs[0].id=602;}});
 assert.equal((await read(f)).valid,false);
});

test('coherent fresh proposer substitution is refused before any archive query',async()=>{
 const f=fixture(),identity=await f.readCurrentProposer(f.prepared);
 const changed={...identity.identity,proposalJobId:602};
 f.readCurrentProposer=async()=>({...identity,identity:changed,digest:hash(JSON.stringify(changed))});
 const r=await createFoottraceCurrentPreparationReader(f)(f.prepared,identity);
 assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});

test('final identity failure after the second archive cannot be hidden by earlier healthy phases',async()=>{
 const f=fixture(),reader=f.readCurrentProposer;
 f.readCurrentProposer=async p=>f.calls.filter(route=>route.endsWith('/zip')).length===2?{valid:false,nativeReason:'current-run-status'}:reader(p);
 assert.equal((await readCurrent(f)).valid,false);
});
