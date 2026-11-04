import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import control from '../guards/release-control.cjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottracePendingObservationReader} from './foottrace-pending.mjs';
import {createFoottraceReviewObservationReader} from './foottrace-reviews.mjs';
import {createFoottraceProposerReader,createFoottraceProposerObservation} from './current-proposer.mjs';
import {createObservedAppCommitReader} from './observed-app-commit.mjs';
import {createFoottraceProposalMetadataReader} from './proposal-metadata.mjs';
import {computeFoottraceProposalMetadata} from './computed-proposal-metadata.mjs';
import {reobserveInspectionBindings} from './inspection-reobservation.mjs';
const fail=()=>{throw new Error('post-ref-observation-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Fixed native post-ref INPUT observer; ONLY the production inspection factory
 * constructs it from its actual runtime baseline/readers. No effect or ACK
 * authority is produced. The owning SAME invocation must independently prove
 * its returned exact force:false ref response and actual native pre-effect.
 * Per9eb222ce, this metadata-only boundary has NO CI predicate. N own merge and
 * release gates remain mandatory, standalone C1 checks are unchanged.
 */
export function createFoottracePostRefObserver({transport,context,baseline,readers,profile,retainedProfile}){
 const port=foottraceTransportPort(transport),source={repository:context.repository,sha:context.sha};
 const options={api:port.api,context:source,settings:{slug:port.settings.slug}};
 const pending=createFoottracePendingObservationReader(options),reviews=createFoottraceReviewObservationReader(options);
 const current=createFoottraceProposerReader({transport,context});
 const signed=createObservedAppCommitReader({api:port.api,repository:port.repository,settings:port.settings,readCurrentProposer:createFoottraceProposerObservation({transport,context})});
 const metadata=createFoottraceProposalMetadataReader(options);
 const prepared=baseline.prepared,prior=baseline.reviews.reference;let available=true,busy=false;
 const unavailable=()=>Object.freeze({valid:false,reason:'post-ref-observation-unavailable',authorized:false});
 return async input=>{
  if(!available||busy){available=false;return unavailable();}busy=true;
  try{
   const expected=fields(jsonData(input),['head']);
   if(!control.validSha(expected.head)||expected.head===prepared.pendingSha||prepared.sourceSha!==context.sha)fail();
   const readPending=async()=>{
    const value=await pending(),v=value.reference;
    if(!value.valid||v.head!==expected.head||v.tree!==prepared.targetTree||v.pr!==prior.pr||v.botId!==prior.botId||
     v.source!==prepared.sourceSha||!isDeepStrictEqual(v.parents,[prepared.sourceSha,prepared.pendingSha]))fail();
    return value;
   };
   const before=await readPending();
   const reviewCheck=async original=>{
    const value=await reviews(before.reference);
    if(!value.valid||value.authorized!==false||value.reviewDigest!==original.reviewDigest||
     value.permissionDigest!==original.permissionDigest||value.reviewCount!==original.reviewCount||
     value.reviewerCount!==original.reviewerCount)fail();
    // Preserve the original binding as immutable INPUT to the SAME retained
    // source/current-run binder; never fabricate a new pending reference.
    return original;
   };
   await reobserveInspectionBindings({baseline,readers,profile,retainedProfile,reviewCheck});
   const nativeCurrent=await current(prepared);
   if(!nativeCurrent.valid||nativeCurrent.digest!==baseline.currentProposer.digest)fail();
   const actual=await signed(prepared,before,nativeCurrent);
   if(!actual.valid||actual.sameTargetTree!==true)fail();
   const desired=computeFoottraceProposalMetadata(prepared),observed=await metadata(before.reference,desired);
   if(!observed.valid)fail();
   const after=await readPending();
   if(!available||!isDeepStrictEqual(before.reference,after.reference))fail();
   const reference={head:expected.head,tree:prepared.targetTree,parents:[prepared.sourceSha,prepared.pendingSha],
    pr:before.reference.pr,source:prepared.sourceSha,signedDigest:actual.digest,desiredDigest:observed.desiredDigest,
    observedDigest:observed.observedDigest,matches:observed.matches};
   return Object.freeze({valid:true,scope:'post-ref-metadata-inputs-only',pending:after,payload:desired,metadata:observed,
    reference:Object.freeze(reference),digest:digest(reference),ciForMetadataRequired:false,
    mergeReleaseGatesStillRequired:true,originalProducerAttributed:false,writerCredentialBindingAdmitted:false,
    retainedEligibilityAdmitted:false,authorized:false});
  }catch{available=false;return unavailable();}
  finally{busy=false;}
 };
}
