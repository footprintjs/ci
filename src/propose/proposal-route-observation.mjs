import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import {id} from '../eco/json-data.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {createFoottracePendingObservationReader} from './foottrace-pending.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('proposal-route-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Actual complete native selector INPUT only, never ordinary eligibility or
 * absence of uncertainty. Failed GET is unknown, not zero. The selected native
 * recipe separately rechecks ALL source/history/producer/writer/effect guards.
 */
export function createFoottraceProposalRouteReader({transport,context}){
 const port=foottraceTransportPort(transport),pinned=foottraceInvocationContext(context),prefix='/repos/footprintjs/foottrace';
 const pending=createFoottracePendingObservationReader({api:port.api,context:{repository:pinned.repository,sha:pinned.sha},settings:{slug:port.settings.slug}});
 const window=async()=>{
  await native.assertCurrentMain(port.api,pinned);
  const ref=own(own(await port.api('GET',prefix+'/git/ref/heads/release/next'),'data'),'object');
  const head=own(ref,'sha');if(own(ref,'type')!=='commit'||!control.validSha(head))fail();
  const rows=await native.pages(port.api,prefix+'/pulls?state=all&head=footprintjs:release/next&base=main');
  if(rows.length>256)fail();const seen=new Set(),projected=[],open=[];
  for(const raw of rows){
   const number=id(own(raw,'number')),h=own(raw,'head'),b=own(raw,'base'),state=own(raw,'state'),sha=own(h,'sha'),base=own(b,'sha'),merge=own(raw,'merge_commit_sha');
   if(seen.has(number)||!['open','closed'].includes(state)||!control.validSha(sha)||!control.validSha(base)||
    (merge!==null&&!control.validSha(merge))||own(h,'ref')!=='release/next'||own(b,'ref')!=='main'||
    !control.sameRepo(own(h,'repo'),pinned.repository)||!control.sameRepo(own(b,'repo'),pinned.repository))fail();
   seen.add(number);
   if(state==='open'){
    const actor=own(raw,'user');
    if(own(actor,'type')!=='Bot'||own(actor,'login')!==port.settings.slug+'[bot]'||sha!==head)fail();
    open.push({number,botId:id(own(actor,'id')),head:sha});
   }
   projected.push({number,state,head:sha,base,merge});
  }
  if(open.length>1)fail();
  await native.assertCurrentMain(port.api,pinned);return {head,open,rows:projected};
 };
 return async prepared=>{
  try{
   if(own(prepared,'valid')!==true||own(prepared,'profileId')!=='foottrace-next-v1'||
    own(prepared,'sourceSha')!==pinned.sha||!control.validSha(own(prepared,'targetTree')))fail();
   const before=await window();let observed=null,kind='ordinary';
   if(before.open.length===1){
    observed=await pending();
    if(!observed.valid||observed.reference.head!==before.head||observed.reference.pr!==before.open[0].number||
     observed.reference.botId!==before.open[0].botId)fail();
    kind=observed.reference.tree===prepared.targetTree?'metadata-only':'ref-refresh';
   }
   const after=await window();if(!isDeepStrictEqual(before,after))fail();
   const reference={head:before.head,pr:observed===null?null:observed.reference.pr,
    tree:observed===null?null:observed.reference.tree,pullsDigest:digest(before.rows)};
   return Object.freeze({valid:true,scope:'proposal-route-observation-only',kind,reference:Object.freeze(reference),digest:digest({kind,reference}),
    authorized:false,retainedEligibilityAdmitted:false,writerCredentialBindingAdmitted:false,absenceOfUncertaintyProved:false});
  }catch{return Object.freeze({valid:false,reason:'proposal-route-unavailable',authorized:false});}
 };
}
