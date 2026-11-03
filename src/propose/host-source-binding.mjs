import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import preparation from '../guards/release-prepare.cjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {snapshotLocalHostSource} from './local-host-source.mjs';
import {own,keys} from './source-inventory.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
const fail=()=>{throw new Error('proposal-host-source-unavailable');};
const sha=b=>createHash('sha256').update(b).digest('hex'),digest=v=>sha(JSON.stringify(v));
const paths={workflow:'.github/workflows/publish.yml',entry:'scripts/release-runner.cjs',profile:'scripts/propose-host-profile.cjs'};
/** Trusted HOST CODE I/O, never saved/model profile data. A match alone is not
 * the missing independent production bridge authority. No source is evaluated.
 * Native complete Git inventory and actual local source bytes bind the inputs.
 */
export function createFoottraceHostSourceReader({transport,context,invocation,host}={}){
 const pinned=foottraceInvocationContext(context),port=foottraceTransportPort(transport);
 keys(host,['readProfile','readSource','requireClean']);
 const readProfile=own(host,'readProfile'),readSource=own(host,'readSource'),requireClean=own(host,'requireClean');
 if([readProfile,readSource,requireClean].some(f=>typeof f!=='function')||port.repository.id!==pinned.repository.id)fail();
 const step=fields(jsonData(invocation),['job','workflowRef','workflowSha','toolSha']);
 if(step.job!=='proposal'||step.workflowSha!==pinned.sha||
  step.workflowRef!=='footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main')fail();
 return async prepared=>{
  const observations=[];
  try{
   if(own(prepared,'valid')!==true||own(prepared,'scope')!=='current-prepared-inputs-only'||
    own(prepared,'sourceSha')!==pinned.sha)fail();
   const prefix='/repos/footprintjs/foottrace/git/';
   const read=async(method,route,body)=>{
    const suffix=typeof route==='string'&&route.startsWith(prefix)?route.slice(prefix.length):'';
    if(method!=='GET'||body!==undefined||observations.length>=4096||
     !(suffix==='ref/heads/main'||suffix==='commits/'+pinned.sha||/^trees\/[a-f0-9]{40}\?recursive=1$/.test(suffix)||/^blobs\/[a-f0-9]{40}$/.test(suffix)))fail();
    const boundary={kind:'native-host-source',method:'GET',status:'unavailable'};observations.push(boundary);
    const result=await port.api(method,route);boundary.status='returned';return result;
   };
   const phase=async()=>{
    await requireClean();
    const profile=fields(jsonData(await readProfile()),['id','sourceSha','sourceTree','toolSha','workflow','entry','profile']);
    if(profile.id!=='foottrace-proposal-host-v1'||profile.sourceSha!==pinned.sha||
     profile.sourceTree!==prepared.sourceTree||profile.toolSha!==step.toolSha)fail();
    const local=snapshotLocalHostSource(await readSource());
    if(local.sourceSha!==pinned.sha||local.sourceTree!==prepared.sourceTree)fail();
    await native.assertCurrentMain(read,pinned);
    const view=native.sourceView(read,pinned),commit=await view.commit(pinned.sha),inventory=await view.inventory(pinned.sha);
    if(commit.tree.sha!==prepared.sourceTree)fail();
    const blobs={};
    for(const kind of Object.keys(paths)){
     const rule=fields(profile[kind],['path','sha','sha256','bytes','mode']);
     if(rule.path!==paths[kind]||! /^[a-f0-9]{40}$/.test(rule.sha)||! /^[a-f0-9]{64}$/.test(rule.sha256)||
      !Number.isSafeInteger(rule.bytes)||rule.bytes<1||rule.bytes>512*1024||
      !['100644','100755'].includes(rule.mode)||(kind==='workflow'&&rule.mode!=='100644'))fail();
     const actual=inventory.get(rule.path),raw=own(local.files,kind);
     if(!actual||actual.sha!==rule.sha||actual.mode!==rule.mode||!Buffer.isBuffer(raw)||raw.length!==rule.bytes)fail();
     const bytes=Buffer.from(raw);
     if(preparation.gitObject('blob',bytes)!==rule.sha||sha(bytes)!==rule.sha256)fail();
     let provider=actual.bytes;
     if(!provider){
      const blob=own(await read('GET',prefix+'blobs/'+rule.sha),'data');
      const content=own(blob,'content');
      if(own(blob,'sha')!==rule.sha||own(blob,'encoding')!=='base64'||own(blob,'size')!==rule.bytes||
       typeof content!=='string'||content.length>700*1024||! /^[A-Za-z0-9+/=\r\n]*$/.test(content))fail();
      provider=Buffer.from(content,'base64');
     }
     if(provider.length!==rule.bytes||preparation.gitObject('blob',provider)!==rule.sha||
      sha(provider)!==rule.sha256||!provider.equals(bytes))fail();
     blobs[kind+'Blob']=rule.sha;
    }
    await native.assertCurrentMain(read,pinned);await requireClean();
    return jsonData({repositoryId:pinned.repository.id,sourceSha:pinned.sha,sourceTree:prepared.sourceTree,
     ...blobs,toolSha:step.toolSha,profileDigest:digest(profile),invocationDigest:digest(step)});
   };
   const before=await phase(),after=await phase();if(!isDeepStrictEqual(before,after))fail();
   return Object.freeze({valid:true,scope:'host-source-binding-only',reference:before,digest:digest(before),
    profileCodeAuthorityAdmitted:false,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,
    authorized:false,executedWrites:0,observations:Object.freeze(observations.map(Object.freeze))});
  }catch{return Object.freeze({valid:false,reason:'proposal-host-source-unavailable',authorized:false,
   observations:Object.freeze(observations.map(Object.freeze))});}
 };
}
