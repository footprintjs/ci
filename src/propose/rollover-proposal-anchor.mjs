import {createHash} from 'node:crypto';
import native from '../guards/release-github.cjs';
import control from '../guards/release-control.cjs';
import {id} from '../eco/json-data.mjs';
import {requireExactCreatedProposalReply} from './proposal-created-reply.mjs';
import {computeFoottraceProposalMetadata} from './computed-proposal-metadata.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('ordinary-proposal-anchor-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** One native ref/PR window recipe, with fixed CODE roles: zero open PR before
 * creation, or ONE exact observed PR afterward. Presence is INPUT only; no
 * acknowledgement, original producer, current writer grant or retry is inferred.
 */
export function createFoottraceOrdinaryProposalAnchor({port,pinned,baseline},createdPr){
 const prefix='/repos/footprintjs/foottrace',list=prefix+'/pulls?state=all&head=footprintjs:release/next&base=main';
 const payload=createdPr===null?null:computeFoottraceProposalMetadata(baseline.prepared);
 if(createdPr!==null)id(createdPr);
 const exact=(value,head)=>{
  const botId=baseline.current.identity.botId;
  requireExactCreatedProposalReply({data:value},{pr:createdPr,head,base:pinned.sha,botId,
   botLogin:port.settings.slug+'[bot]',repository:pinned.repository,payload});
  return {pr:createdPr,head,base:pinned.sha,botId,metadataDigest:digest(payload)};
 };
 return async head=>{
  await native.assertCurrentMain(port.api,pinned);
  const ref=own(own(await port.api('GET',prefix+'/git/ref/heads/release/next'),'data'),'object');
  if(own(ref,'type')!=='commit'||own(ref,'sha')!==head)fail();
  const rows=await native.pages(port.api,list);if(rows.length>256)fail();
  const seen=new Set(),projected=[];let open=null;
  for(const row of rows){
   const number=id(own(row,'number')),h=own(row,'head'),b=own(row,'base'),sha=own(h,'sha');
   if(seen.has(number)||!control.validSha(sha)||own(h,'ref')!=='release/next'||own(b,'ref')!=='main'||
    !control.sameRepo(own(h,'repo'),pinned.repository)||!control.sameRepo(own(b,'repo'),pinned.repository))fail();
   seen.add(number);
   if(own(row,'state')==='open'){
    if(createdPr===null||number!==createdPr||open!==null)fail();
    open=exact(row,head);
   }else{
    if(own(row,'state')!=='closed'||sha===head)fail();
    const merge=own(row,'merge_commit_sha');if(merge!==null&&!control.validSha(merge))fail();
    projected.push({number,head:sha,merge});
   }
  }
  if(createdPr!==null){
   if(open===null)fail();
   const detail=own(await port.api('GET',prefix+'/pulls/'+createdPr),'data');exact(detail,head);
  }
  return {head,closedPullsDigest:digest(projected),...(createdPr===null?{}:{pr:createdPr,createdPullDigest:digest(open)})};
 };
}
