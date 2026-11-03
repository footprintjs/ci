import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import {jsonData} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottracePreparationProfile} from './foottrace-profile.mjs';
import {createCurrentPreparedInputReader} from './current-prepared-inputs.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=reason=>{const e=new Error('current-prepared-inputs-unavailable');e.ordinaryReason=reason;throw e;};
/** Native ordinary current-source admission only, with a new source view per
 * adjacent phase. No historical run/ref/creator is selected; current producer
 * and actual current artifact must still be joined by the enclosing chart.
 */
export function createFoottraceCurrentInputReader({transport,context}={}) {
 let pinned,port;
 try{
  pinned=foottraceInvocationContext(context);port=foottraceTransportPort(transport);
  if(!control.sameRepo(port.repository,pinned.repository))throw new Error();
 }catch{port=null;}
 const prepare=createCurrentPreparedInputReader(createFoottracePreparationProfile());
 return async()=>{
  const observations=[];
  try{
   if(!port)fail();
   const prefix='/repos/footprintjs/foottrace/git/';
   const read=async(method,route,body)=>{
    const suffix=typeof route==='string'&&route.startsWith(prefix)?route.slice(prefix.length):'';
    if(method!=='GET'||body!==undefined||observations.length>=4096||
     !(suffix==='ref/heads/main'||suffix==='commits/'+pinned.sha||/^trees\/[a-f0-9]{40}\?recursive=1$/.test(suffix)||/^blobs\/[a-f0-9]{40}$/.test(suffix)))fail();
    const row={kind:'native-current-source',method:'GET',status:'unavailable'};observations.push(row);
    const value=await port.api(method,route);row.status='native-input';return value;
   };
   const phase=async()=>{
    await native.assertCurrentMain(read,pinned);
    const view=native.sourceView(read,pinned),source=await native.sourceInput(read,pinned,view);
    if(source.intents.active.length!==0)fail('ordinary-active-recovery');
    if(!source.queue.length)fail();
    const commit=jsonData({sha:source.commit.sha,tree:{sha:source.commit.tree.sha},
     parents:source.commit.parents.map(p=>({sha:p.sha})),committer:{date:source.commit.committer.date}});
    const prepared=prepare({source:{commit,inventory:source.inventory},preparationDate:null});
    if(!prepared.valid||prepared.sourceSha!==pinned.sha||prepared.sourceTree!==source.commit.tree.sha||prepared.fromVersion!==source.pkg.version)fail();
    const inventory=[...source.inventory].map(([path,row])=>({path,mode:row.mode,sha:row.sha})).sort((a,b)=>a.path.localeCompare(b.path));
    const reference=jsonData({repositoryId:pinned.repository.id,sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,
     targetTree:prepared.targetTree,fromVersion:prepared.fromVersion,version:prepared.version,preparationDate:prepared.preparationDate,
     queueDigest:digest(prepared.queue),inventoryDigest:digest(inventory),preparationDigest:digest(prepared.prepared),
     archivedIntentRecords:source.intents.records.length});
    await native.assertCurrentMain(read,pinned);
    return {prepared,reference};
   };
   const before=await phase(),after=await phase();
   if(!isDeepStrictEqual(before.reference,after.reference)||!isDeepStrictEqual(before.prepared,after.prepared))fail();
   return Object.freeze({valid:true,scope:'native-current-prepared-inputs-only',prepared:before.prepared,reference:before.reference,
    digest:digest(before.reference),preparationKind:'next',originalProducerAttributed:false,writerCredentialBindingAdmitted:false,
    privateAppIdentityAdmitted:false,retainedEligibilityAdmitted:false,authorized:false,
    observations:Object.freeze(observations.map(Object.freeze))});
  }catch(error){
   const descriptor=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'ordinaryReason'):null;
   return Object.freeze({valid:false,reason:descriptor?.value==='ordinary-active-recovery'?'ordinary-active-recovery':'current-prepared-inputs-unavailable',
    nativeReason:native.refusalCode(error),authorized:false,observations:Object.freeze(observations.map(Object.freeze))});
  }
 };
}
