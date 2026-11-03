import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import {jsonData} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottracePreparationProfile} from './foottrace-profile.mjs';
import {createCurrentPreparedInputReader} from './current-prepared-inputs.mjs';
import {own} from './source-inventory.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=()=>{throw new Error('metadata-parent-source-unavailable');};
/** Immediate signed-P parent SOURCE DATA, not its original producer.
 * Native source/preparation + L→B→M ancestry + unchanged raw queue are bound
 * without selecting any run/archive creator. This does NOT admit ref refresh,
 * its eight-hop witnesses, full history, writer provenance or an effect.
 */
export function createFoottraceMetadataParentSourceReader({transport,context}={}) {
 let pinned,port;
 try{
  pinned=foottraceInvocationContext(context);port=foottraceTransportPort(transport);
  if(!control.sameRepo(port.repository,pinned.repository))fail();
 }catch{port=null;}
 const prepare=createCurrentPreparedInputReader(createFoottracePreparationProfile());
 return async(prepared,pending,lineage)=>{
  const observations=[];
  try{
   if(!port||own(prepared,'valid')!==true||own(prepared,'scope')!=='current-prepared-inputs-only'||
    own(prepared,'sourceSha')!==pinned.sha||own(pending,'valid')!==true||own(pending,'scope')!=='pending-reference-only'||
    own(pending,'authorized')!==false||own(lineage,'valid')!==true||own(lineage,'scope')!=='published-lineage-only'||
    own(lineage,'authorized')!==false||own(lineage,'sourceSha')!==pinned.sha||own(lineage,'sourceTree')!==prepared.sourceTree||
    own(lineage,'version')!==prepared.fromVersion)fail();
   const ref=own(pending,'reference'),parents=own(ref,'parents'),predecessor=own(lineage,'predecessor');
   if(!Array.isArray(parents)||parents.length!==2||new Set(parents).size!==2||!parents.every(control.validSha)||
    own(ref,'source')!==pinned.sha||own(ref,'tree')!==prepared.targetTree||!control.validSha(own(ref,'head'))||
    !control.validSha(own(predecessor,'merge')))fail();
   const parent=parents[0],prefix='/repos/footprintjs/foottrace';
   const compares=new Set([predecessor.merge+'...'+parent,parent+'...'+pinned.sha]);
   const read=async(method,route,body)=>{
    const git=prefix+'/git/',suffix=typeof route==='string'&&route.startsWith(git)?route.slice(git.length):'';
    const comparePrefix=prefix+'/compare/',isCompare=typeof route==='string'&&route.startsWith(comparePrefix);
    const pair=isCompare?route.slice(comparePrefix.length).split('?')[0]:'';
    if(method!=='GET'||body!==undefined||observations.length>=4096||
     !(suffix==='ref/heads/main'||suffix==='commits/'+parent||/^trees\/[a-f0-9]{40}\?recursive=1$/.test(suffix)||
      /^blobs\/[a-f0-9]{40}$/.test(suffix)||(isCompare&&compares.has(pair)&&/\?per_page=100&page=[1-8]$/.test(route))))fail();
    const row={kind:'metadata-parent-native-source',method:'GET',status:'unavailable'};observations.push(row);
    const value=await port.api(method,route);row.status='native-input';return value;
   };
   const phase=async()=>{
    await native.assertCurrentMain(read,pinned);
    const view=native.sourceView(read,pinned),source=await native.sourceInput(read,{repository:pinned.repository,sha:parent},view);
    if(source.intents.active.length||!source.queue.length||source.pkg.version!==prepared.fromVersion)fail();
    const commit=jsonData({sha:source.commit.sha,tree:{sha:source.commit.tree.sha},parents:source.commit.parents.map(p=>({sha:p.sha})),committer:{date:source.commit.committer.date}});
    const rebuilt=prepare({source:{commit,inventory:source.inventory},preparationDate:null});
    if(!rebuilt.valid||rebuilt.sourceSha!==parent||rebuilt.targetTree!==ref.tree||rebuilt.fromVersion!==prepared.fromVersion)fail();
    preparation.requireQueueSubset(rebuilt.queue,prepared.queue);
    await native.requireAncestor(read,pinned,predecessor.merge,parent);
    await native.requireAncestor(read,pinned,parent,pinned.sha);
    await native.assertCurrentMain(read,pinned);
    return jsonData({repositoryId:pinned.repository.id,sourceSha:parent,sourceTree:rebuilt.sourceTree,pendingHead:ref.head,
     targetTree:ref.tree,parents,currentSourceSha:pinned.sha,currentSourceTree:prepared.sourceTree,currentTargetTree:prepared.targetTree,
     lineageMerge:predecessor.merge,fromVersion:rebuilt.fromVersion,version:rebuilt.version,preparationDate:rebuilt.preparationDate,
     queueDigest:digest(rebuilt.queue),currentQueueDigest:digest(prepared.queue),preparationDigest:digest(rebuilt.prepared)});
   };
   const before=await phase(),after=await phase();if(!isDeepStrictEqual(before,after))fail();
   return Object.freeze({valid:true,scope:'metadata-parent-source-only',reference:before,digest:digest(before),
    originalProducerAttributed:false,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,authorized:false,
    observations:Object.freeze(observations.map(Object.freeze))});
  }catch(error){return Object.freeze({valid:false,reason:'metadata-parent-source-unavailable',nativeReason:native.refusalCode(error),
   authorized:false,observations:Object.freeze(observations.map(Object.freeze))});}
 };
}
