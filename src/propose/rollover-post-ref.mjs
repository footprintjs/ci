import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import control from '../guards/release-control.cjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {createFoottraceRolloverTransitionObjectReader} from './proposal-object-observation.mjs';
import {bindOrdinaryPublishedObservation} from './rollover-published-binding.mjs';
import {createFoottraceOrdinaryProposalAnchor} from './rollover-proposal-anchor.mjs';
const fail=()=>{throw new Error('ordinary-post-ref-inputs-unavailable');};
const requireValid=v=>{if(v?.valid!==true)fail();return v;};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Native observed N/M/L INPUT only, constructed from this factory's actual
 * pre-ref baseline. It never accepts an ACK/grant or saves one. The owning
 * effect flow must independently prove its exact returned ref response and
 * native pre-effect before any create-PR. Signature/tree/presence is no retry
 * permission, original producer attribution or current writer authority.
 */
export function createFoottraceRolloverTransitionObserver(options){return createObserver(options,null);}
function createObserver({transport,context,baseline,readers},createdPr){
 const port=foottraceTransportPort(transport),pinned=foottraceInvocationContext(context),p=baseline.prepared;
 const objects=createFoottraceRolloverTransitionObjectReader({transport,context:pinned},baseline);
 let available=true,busy=false;
 const unavailable=()=>Object.freeze({valid:false,reason:'ordinary-post-ref-inputs-unavailable',authorized:false});
 const anchor=createFoottraceOrdinaryProposalAnchor({port,pinned,baseline},createdPr);
 const read=async input=>{
  if(!available||busy){available=false;return unavailable();}busy=true;
  try{
   const {head}=fields(jsonData(input),['head']);
   if(!control.validSha(head)||head===p.sourceSha||head===baseline.rollover.reference.predecessor.head)fail();
   const before=await anchor(head),source=requireValid(await readers.source());
   if(source.digest!==baseline.source.digest||!isDeepStrictEqual(source.prepared,p))fail();
   const current=requireValid(await readers.current(p)),archive=requireValid(await readers.archive(p,current));
   const published=bindOrdinaryPublishedObservation(await readers.published(),baseline);
   const workflows=requireValid(await readers.workflows()),versions=requireValid(await readers.versions(p,workflows));
   const attempts=requireValid(readers.assess({prepared:p,collection:workflows,versions,current,archive,published}));
   if(attempts.eligible!==true)fail();
   const candidate=requireValid(await readers.candidate(p));
   for(const [key,value] of Object.entries({current,archive,workflows,versions,attempts,candidate}))
    if(value.digest!==baseline[key].digest)fail();
   const signed=requireValid(await objects.commit(p,{sha:head})),after=await anchor(head);
   if(!isDeepStrictEqual(before,after))fail();
   const finalCurrent=requireValid(await readers.current(p));
   if(!available||finalCurrent.digest!==baseline.current.digest)fail();
   const reference={head,source:p.sourceSha,tree:p.targetTree,parents:[p.sourceSha,published.predecessor.head],
    publishedHead:published.predecessor.head,closedPullsDigest:after.closedPullsDigest,
    ...(createdPr===null?{}:{pr:createdPr,createdPullDigest:after.createdPullDigest}),
    signedDigest:digest(signed.object),currentDigest:finalCurrent.digest,archiveDigest:archive.digest,
    workflowDigest:workflows.digest,candidateDigest:candidate.digest};
   return Object.freeze({valid:true,scope:createdPr===null?'ordinary-post-ref-inputs-only':'ordinary-created-pr-inputs-only',reference:Object.freeze(reference),digest:digest(reference),
    authorized:false,submissionAcknowledged:false,originalProducerAttributed:false,writerCredentialBindingAdmitted:false,
    retainedEligibilityAdmitted:false,providerContinuityProved:false,erasedHistoryProved:false});
  }catch{available=false;return unavailable();}finally{busy=false;}
 };
 // Advancing the fixed observed PR role consumes the zero-open-PR reader. The
 // scalar is only an observation anchor, never an ACK or saved permission.
 if(createdPr===null)Object.defineProperty(read,'forCreatedProposal',{value:pr=>{
  if(!available||busy){available=false;fail();}
  available=false;
  return createObserver({transport,context:pinned,baseline,readers},pr);
 }});
 return Object.freeze(read);
}
