import {createFoottracePendingReader} from './foottrace-pending.mjs';
import {createFoottracePostRefObserver} from './foottrace-post-ref.mjs';
import {createInspectionReobserver} from './inspection-reobservation.mjs';
import {isDeepStrictEqual} from 'node:util';
import {id} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {createFoottraceInputBootstrap} from './foottrace-input-bootstrap.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceRetainedAttemptProfile,createFoottracePendingWitnessProfile,createFoottraceWorkflowProfile} from './foottrace-profile.mjs';
import {createProposeInspection,runProposeInspectionStage} from './inspection-flow.mjs';
import {createFoottraceLineageReader} from './foottrace-lineage.mjs';
import {createFoottraceAncestryReader} from './foottrace-ancestry.mjs';
import {createFoottraceReviewReader} from './foottrace-reviews.mjs';
import {createRetainedWorkflowReader} from './retained-workflows.mjs';
import {createRetainedWitnessReader} from './retained-witnesses.mjs';
import {createRetainedSourceVersionReader} from './retained-source-versions.mjs';
import {createFoottraceCandidatePublicationReader} from './candidate-publication.mjs';
import {createFoottraceProposerReader,createFoottraceProposerObservation} from './current-proposer.mjs';
import {createFoottraceCurrentPreparationReader} from './current-preparation.mjs';
import {createFoottraceOrdinaryPreparationReader} from './foottrace-ordinary-preparation.mjs';

/** Production read-only facade. Only a runtime opaque native transport and
 * actual invocation identifiers enter; callers supply no prepared witnesses,
 * saved approvals, lineage/history or callbacks. The existing shared inspection
 * recipe extends the SAME native chart built by discovery; one executor/record.
 * Writer-token handoff, full effect eligibility and effects remain unadmitted.
 */
export function createFoottraceProposeInspection({transport,context,artifactId}={},predecessor) {
 let pinned,sourceContext,port,valid=false;
 try{
  pinned=foottraceInvocationContext(context);id(artifactId);
  port=foottraceTransportPort(transport);sourceContext={repository:pinned.repository,sha:pinned.sha};valid=true;
 }catch{/* The native bootstrap records invalid input without service reads. */}
 const bootstrap=createFoottraceInputBootstrap({transport:valid?transport:null,context:valid?sourceContext:undefined},predecessor);
 let readers={},collectWorkflows=null;
 try{
  if(!valid)throw new Error();
  const profile=createFoottraceWorkflowProfile();
  const readWorkflows=createRetainedWorkflowReader({api:port.api,repository:port.repository,profile});
  collectWorkflows=readWorkflows;
  const readCurrentProposer=createFoottraceProposerReader({transport,context:pinned});
  const readCurrentArchive=createFoottraceCurrentPreparationReader({api:port.api,context:pinned,artifactId,
   readCurrentProposer:createFoottraceProposerObservation({transport,context:pinned})});
  readers={
   readOrdinaryPreparation:createFoottraceOrdinaryPreparationReader({api:port.api,context:sourceContext}),
   readLineage:createFoottraceLineageReader({transport:port,context:sourceContext,settings:port.settings}),
   readAncestry:createFoottraceAncestryReader({api:port.api,context:sourceContext}),
   readReviews:createFoottraceReviewReader({api:port.api,context:sourceContext,settings:{slug:port.settings.slug}}),
   readWorkflows:async()=>{
    const value=await readWorkflows(),initial=bootstrap.getBackend();
    if(!initial||!value.valid||value.digest!==initial.collection.digest)
     return {valid:false,reason:'retained-workflow-discovery-drift'};
    return value;
   },
   readRetainedWitnesses:createRetainedWitnessReader({api:port.api,repository:port.repository,profile:createFoottracePendingWitnessProfile()}),
   readRetainedVersions:createRetainedSourceVersionReader({api:port.api,repository:port.repository,packageName:'foottrace',profile,candidateScope:'pending-chain'}),
   readCandidatePublication:createFoottraceCandidatePublicationReader({api:port.api,registry:port.registry,repository:port.repository,candidateScope:'pending-chain'}),
   readCurrentProposer,
   readCurrentPreparation:async(prepared,previous)=>{
    // The shared recipe retains a compact binding. Reacquire the actual native
    // observation instead of fabricating its valid/scope/private-App flags.
    const fresh=await readCurrentProposer(prepared);
    if(!fresh.valid||fresh.digest!==previous.digest||!isDeepStrictEqual(fresh.identity,previous.identity))
     return {valid:false,reason:'current-proposer-unavailable'};
    return readCurrentArchive(prepared,fresh);
   }
  };
 }catch{readers={};}
 const retainedProfile=createFoottraceRetainedAttemptProfile();
 const stage=createProposeInspection({profile:bootstrap.profile,readers,inputBootstrap:bootstrap,retainedProfile});
 let readEffectAnchors=null;
 try{
  const pending=createFoottracePendingReader({api:port.api,context:sourceContext,settings:{slug:port.settings.slug}});
  readEffectAnchors=async baseline=>{
   const actual=await pending(baseline.prepared);
   return actual.valid&&isDeepStrictEqual(actual.reference,baseline.reviews.reference);
  };
 }catch{/* Missing fixed native anchors never allows an effect. */}
 const observed=createInspectionReobserver({stage,bootstrap,readers,profile:bootstrap.profile,retainedProfile,readEffectAnchors});
 // CODE-only transition construction captures immutable INPUT facts then
 // permanently invalidates the old-P mutable observer. No ACK/grant is supplied
 // as DATA; the owning flow must prove its actual returned ref/prefix itself.
 return Object.freeze({...observed,createTransitionObserver:()=>{
  const baseline=observed.getBackend();
  if(!baseline||baseline.retainedAttempts?.eligible!==true||collectWorkflows===null)throw new Error('post-ref-inputs-unavailable');
  observed.invalidate();
  return createFoottracePostRefObserver({transport,context:pinned,baseline,
   readers:{...readers,readWorkflows:collectWorkflows},profile:bootstrap.profile,retainedProfile});
 }});
}

/** The public facade never forwards DATA composition or reader/executor ports. */
export async function runFoottraceProposeInspection({transport,context,artifactId,recordLimitBytes}={}){
 return runProposeInspectionStage(createFoottraceProposeInspection({transport,context,artifactId}),recordLimitBytes);
}
