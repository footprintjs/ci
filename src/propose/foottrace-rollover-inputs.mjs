import gitBlob from '../guards/git-blob.cjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import {jsonData} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottracePreparationProfile} from './foottrace-profile.mjs';
import {createFoottraceLineageObservationReader} from './foottrace-lineage.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('rollover-inputs-unavailable');};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sameData=(a,b)=>isDeepStrictEqual(jsonData(a),jsonData(b));
/** Closed-published ordinary rollover INPUT only. Reuses the SAME pinned native
 * proposalPreflight/publication/source guards; no target helper is executed.
 * L is the actual published predecessor, never a fabricated pending witness P.
 * Current producer/archive/history/writer/pre-effect admission remains separate.
 */
export function createFoottraceRolloverInputReader({transport,context}={}){
 let pinned,port,lineage;
 const profile=createFoottracePreparationProfile();
 try{
  pinned=foottraceInvocationContext(context);port=foottraceTransportPort(transport);
  if(!control.sameRepo(pinned.repository,port.repository))fail();
  lineage=createFoottraceLineageObservationReader({transport:port,
   context:{repository:pinned.repository,sha:pinned.sha},settings:port.settings});
 }catch{port=null;}
 return async prepared=>{
  const observations=[];
  try{
   if(!port||own(prepared,'valid')!==true||own(prepared,'scope')!=='current-prepared-inputs-only'||
    own(prepared,'profileId')!==profile.id||own(prepared,'packageName')!=='foottrace'||own(prepared,'authorized')!==false||
    own(prepared,'originalProducerAttributed')!==false||own(prepared,'sourceSha')!==pinned.sha||
    own(prepared,'pendingSha')!==undefined||own(prepared,'preparationRefs')!==undefined||
    !['sourceSha','sourceTree','targetTree'].every(k=>control.validSha(own(prepared,k))))fail();
   preparation.parseVersion(prepared.version);preparation.parseVersion(prepared.fromVersion);
   const payload={base:pinned.sha,tree:prepared.sourceTree,repository:pinned.repository,prepared:jsonData(own(prepared,'prepared'))};
   const plan={mode:'prepare',preparationKind:'next',repository:pinned.repository,sha:pinned.sha,
    tree:prepared.sourceTree,version:prepared.version,package:'foottrace',date:prepared.preparationDate};
   const prefix='/repos/footprintjs/foottrace';
   const read=async(method,route,body)=>{
    if(method!=='GET'||typeof route!=='string'||observations.length>=4096||
     !(route===prefix||route.startsWith(prefix+'/')||route==='/users/'+encodeURIComponent(port.settings.slug+'[bot]')||
      route==='/apps/'+encodeURIComponent(port.settings.slug))||
     !(body===undefined||(body&&Object.keys(body).length===1&&body.accept==='application/octet-stream')))fail();
    const row={kind:'native-rollover-read',method:'GET',status:'unavailable'};observations.push(row);
    const result=await port.api(method,route,body);row.status='native-input';return result;
   };
   gitBlob.inheritGitBlobRead(read,port.api);
   const phase=async()=>{
    const published=await lineage();
    if(!published.valid||published.sourceSha!==pinned.sha||published.sourceTree!==prepared.sourceTree||
     published.version!==prepared.fromVersion)fail();
    const value=await native.proposalPreflight(read,pinned,payload,plan,{
     settings:port.settings,fetcher:port.registry(prepared.fromVersion)});
    if(value.state.action!=='rollover'||own(value.retained,'open')!==undefined||
     value.expectedTree!==prepared.targetTree||!sameData(value.predecessor,published.predecessor)||
     value.retained.head.sha!==published.predecessor.head||!sameData(value.rebuilt,payload))fail();
    return jsonData({repositoryId:pinned.repository.id,sourceSha:pinned.sha,sourceTree:prepared.sourceTree,targetTree:prepared.targetTree,
     fromVersion:prepared.fromVersion,version:prepared.version,preparationDate:prepared.preparationDate,
     predecessor:published.predecessor,publishedProducer:published.producer,publishedArchiveDigest:published.archiveDigest,
     retainedHeadSha:value.retained.head.sha,nextParents:[pinned.sha,published.predecessor.head],proposalAction:'rollover'});
   };
   const before=await phase(),after=await phase();if(!isDeepStrictEqual(before,after))fail();
   return Object.freeze({valid:true,scope:'closed-published-rollover-inputs-only',reference:Object.freeze(before),digest:digest(before),
    authorized:false,retainedEligibilityAdmitted:false,writerCredentialBindingAdmitted:false,originalProducerAttributed:false,
    providerContinuityProved:false,erasedHistoryProved:false,
    observations:Object.freeze(observations.map(Object.freeze))});
  }catch(error){return Object.freeze({valid:false,reason:'rollover-inputs-unavailable',nativeReason:native.refusalCode(error),authorized:false,
   observations:Object.freeze(observations.map(Object.freeze))});}
 };
}
