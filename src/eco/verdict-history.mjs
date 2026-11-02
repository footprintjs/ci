import { createHash } from 'node:crypto';
import { parseVerdictComment } from './verdict-comment.mjs';
import { jsonData,fields,text,id,array,invalid } from './json-data.mjs';
const SHA=/^[a-f0-9]{40}$/, DIGEST=/^[a-f0-9]{64}$/, PROVIDER=/^[1-9][0-9]{0,31}$/;
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const bool=v=>{if(typeof v!=='boolean')invalid();return v;};
function validateReceipt(prior) {
 fields(prior,['format','repositoryId','pullNumber','throughSequence','push','entries','continuous','lastBatchDigest']);
 if(prior.format!=='eco-verdict-observations-v1'||!Number.isSafeInteger(prior.throughSequence)||prior.throughSequence<0)invalid();
 id(prior.repositoryId);id(prior.pullNumber);bool(prior.continuous);
 if(prior.lastBatchDigest!==null)text(prior.lastBatchDigest,DIGEST,64);
 if(prior.push!==null){fields(prior.push,['head','sequence','providerId']);text(prior.push.head,SHA,40);id(prior.push.sequence);text(prior.push.providerId,PROVIDER,32);if(prior.push.sequence>prior.throughSequence)invalid();}
 array(prior.entries,512);const ids=new Set(),positions=new Set();
 for(const e of prior.entries){
  fields(e,['id','authorId','createdSequence','bodySha256','first','everVerdictLike','changed','deleted']);id(e.id);id(e.authorId);
  if(ids.has(e.id))invalid();ids.add(e.id);text(e.bodySha256,DIGEST,64);bool(e.everVerdictLike);bool(e.changed);bool(e.deleted);
  if(e.createdSequence!==null){id(e.createdSequence);if(e.createdSequence>prior.throughSequence||positions.has(e.createdSequence))invalid();positions.add(e.createdSequence);}
  if(e.first?.kind==='parsed'){
   fields(e.first,['kind','verdict','bodySha256']);if(e.first.bodySha256!==e.bodySha256)invalid();const v=e.first.verdict;
   fields(v,['reviewer','verdict','action','head','base','tree','scope']);
   if(v.reviewer!=='Claude'||!['merge','changes','hold'].includes(v.verdict)||!['merge-source','release','policy'].includes(v.action))invalid();
   for(const k of ['head','base','tree'])text(v[k],SHA,40);fields(v.scope,['sha256','bytes']);text(v.scope.sha256,DIGEST,64);id(v.scope.bytes);if(v.scope.bytes>1024)invalid();
  } else {fields(e.first,['kind']);if(!['malformed','not-verdict'].includes(e.first.kind))invalid();}
  if(e.first.kind!=='not-verdict'&&!e.everVerdictLike)invalid();
 }
 if(prior.continuous&&!prior.push)invalid();return prior;
}
/** Compact observation receipts, not a causal graph or authenticated event log.
 * `continuous` is a producer coverage claim, never inferred from current pages.
 * The status driver must bind its trusted producer/previous-receipt provenance.
 * Current-page readers use comment-seen; only ordered creation events establish
 * creation-after-push. Edited/deleted observations can never revive old bodies.
 */
export function foldVerdictObservations(previous,rawBatch,expectedPreviousDigest=null) {
 const batch=jsonData(rawBatch);fields(batch,['schemaVersion','repositoryId','pullNumber','fromSequence','continuous','events']);
 if(batch.schemaVersion!==1)invalid();id(batch.repositoryId);id(batch.pullNumber);id(batch.fromSequence);bool(batch.continuous);array(batch.events,512);
 const batchDigest=digest(batch);let state;
 if(previous===null){
  if(expectedPreviousDigest!==null)invalid();
  state={format:'eco-verdict-observations-v1',repositoryId:batch.repositoryId,pullNumber:batch.pullNumber,throughSequence:0,push:null,entries:[],continuous:false,lastBatchDigest:null};
 } else {
  text(expectedPreviousDigest,DIGEST,64);const prior=validateReceipt(jsonData(previous));if(digest(prior)!==expectedPreviousDigest)invalid();
  fields(prior,['format','repositoryId','pullNumber','throughSequence','push','entries','continuous','lastBatchDigest']);
  if(prior.format!=='eco-verdict-observations-v1'||prior.repositoryId!==batch.repositoryId||prior.pullNumber!==batch.pullNumber)invalid();
  if(batchDigest===prior.lastBatchDigest)return Object.freeze({state:prior,digest:digest(prior),replayed:true});
  // A prior receipt was produced by this folder and pinned separately by caller.
  // Clone before updating; its historical bytes remain immutable.
  state=JSON.parse(JSON.stringify(prior));
 }
 if(state.throughSequence && batch.fromSequence!==state.throughSequence+1)state.continuous=false;
 if(!batch.continuous)state.continuous=false;
 for(const event of batch.events){
  if(!event||typeof event!=='object')invalid();id(event.sequence);text(event.providerId,PROVIDER,32);
  if(event.sequence<=state.throughSequence){state.continuous=false;continue;}
  const adjacent=event.sequence===state.throughSequence+1;
  if(!adjacent)state.continuous=false;
  state.throughSequence=event.sequence;
  if(event.kind==='head-push'){
   fields(event,['sequence','providerId','kind','head']);text(event.head,SHA,40);
   state.push={head:event.head,sequence:event.sequence,providerId:event.providerId};
   // A newly observed push starts a new epoch; old comment creation positions
   // remain before it. No receipt is reconstructed from commit timestamps.
   state.continuous=batch.continuous && (adjacent||state.entries.length===0);
   continue;
  }
  if(event.kind==='gap'){
   fields(event,['sequence','providerId','kind']);state.continuous=false;continue;
  }
  if(!['comment-created','comment-seen','comment-edited','comment-deleted'].includes(event.kind))invalid();
  const deleted=event.kind==='comment-deleted';
  fields(event,deleted?['sequence','providerId','kind','id']:['sequence','providerId','kind','id','authorId','body']);id(event.id);
  if(!deleted){id(event.authorId);if(typeof event.body!=='string'||Buffer.byteLength(event.body)>64*1024)invalid();}
  const existing=state.entries.find(x=>x.id===event.id);
  if(deleted){if(!existing){state.continuous=false;continue;}existing.deleted=true;continue;}
  const bodySha256=digest(event.body),parsed=parseVerdictComment(event.body);
  if(existing){
   if(existing.authorId!==event.authorId)invalid();
   if(bodySha256!==existing.bodySha256)existing.changed=true;
   if(parsed.kind!=='not-verdict')existing.everVerdictLike=true;
   if(event.kind==='comment-created')state.continuous=false;
   continue;
  }
  if(event.kind==='comment-edited'){state.continuous=false;continue;}
  if(state.entries.length>=512)invalid();
  state.entries.push({id:event.id,authorId:event.authorId,createdSequence:event.kind==='comment-created'?event.sequence:null,
   bodySha256,first:parsed,everVerdictLike:parsed.kind!=='not-verdict',changed:false,deleted:false});
 }
 state.lastBatchDigest=batchDigest;
 const frozen=validateReceipt(jsonData(state));return Object.freeze({state:frozen,digest:digest(frozen),replayed:false});
}
/** One conditional receipt predicate only, never policy/native release authority. */
export function observedVerdictFinding(rawState,rawBinding) {
 try {
 const state=validateReceipt(jsonData(rawState)),binding=jsonData(rawBinding);
 fields(binding,['repositoryId','pullNumber','ownerId','head','base','tree','action']);
 for(const k of ['repositoryId','pullNumber','ownerId'])id(binding[k]);for(const k of ['head','base','tree'])text(binding[k],SHA,40);
 if(!['merge-source','release','policy'].includes(binding.action))invalid();
 const {repositoryId,pullNumber,ownerId,head,base,tree,action}=binding;
 const missing=reason=>Object.freeze({code:'verdict-missing',reason});
 if(!state||state.repositoryId!==repositoryId||state.pullNumber!==pullNumber||!state.continuous||!state.push)return missing('history-incomplete');
 if(state.push.head!==head)return Object.freeze({code:'verdict-stale',reason:'head-push'});
 const entries=state.entries.filter(x=>x.authorId===ownerId&&x.everVerdictLike&&x.createdSequence>state.push.sequence&&
  (x.first.kind!=='parsed'||x.first.verdict.head===head)).sort((a,b)=>b.id-a.id);
 const latest=entries[0];if(!latest)return missing('creation-after-push-unproven');
 if(latest.deleted||latest.changed)return Object.freeze({code:'verdict-superseded',reason:'withdrawn-or-edited',commentId:latest.id});
 if(latest.first.kind!=='parsed')return missing('malformed-latest');
 const v=latest.first.verdict;
 if(v.base!==base||v.tree!==tree||v.action!==action)return Object.freeze({code:'verdict-stale',reason:'binding-or-action',commentId:latest.id});
 if(v.verdict!=='merge')return Object.freeze({code:'verdict-superseded',reason:'latest-refusal',commentId:latest.id});
 return Object.freeze({code:'verdict-metadata-matched',commentId:latest.id,bodySha256:latest.bodySha256});
 }catch{return Object.freeze({code:'verdict-missing',reason:'input-invalid'});}
}
