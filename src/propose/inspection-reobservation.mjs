import {isDeepStrictEqual} from 'node:util';
import {packageProfile} from './package-profile.mjs';
import {createRetainedAttemptAssessor} from './retained-attempts.mjs';
import {lineageBinding,ancestryBinding,reviewBinding,workflowBinding,candidateBinding,
 sourceVersionBinding,retainedWitnessBinding,proposerBinding,currentPreparationBinding,ordinaryPreparationBinding} from './inspection-bindings.mjs';
const fail=()=>{throw new Error('propose-input-observation-drift');};
/** Reuses the SAME native readers and binding guards as the inspection recipe.
 * No executor, journal, saved authority or effect eligibility is created here.
 * The owning native function stage must prove its own completed prefix and
 * independently require every retained/current/check/grant predicate.
 */
export function createInspectionReobserver({stage,bootstrap,readers,profile,retainedProfile}){
 const recipe=packageProfile(profile),assess=createRetainedAttemptAssessor(retainedProfile);
 let available=true,busy=false;
 const getBackend=()=>available?stage.getBackend():null;
 const reobserve=async()=>{
  const baseline=getBackend();if(baseline===null)return false;
  if(busy){available=false;return false;}busy=true;
  const same=(value,key)=>{if(!isDeepStrictEqual(value,baseline[key]))fail();return value;};
  const prepared=baseline.prepared;
  try{
   if(!await bootstrap.reobserve())fail();
   same(ordinaryPreparationBinding(await readers.readOrdinaryPreparation(prepared),prepared),'ordinaryPreparation');
   const lineage=same(lineageBinding(await readers.readLineage({sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,
    fromVersion:prepared.fromVersion,predecessor:prepared.predecessor}),prepared),'lineage');
   same(ancestryBinding(await readers.readAncestry(prepared),prepared),'ancestry');
   const reviews=same(reviewBinding(await readers.readReviews(prepared),prepared,recipe),'reviews');
   const collection=await readers.readWorkflows(),workflows=same(workflowBinding(collection,prepared),'workflows');
   same(retainedWitnessBinding(await readers.readRetainedWitnesses(prepared,collection),prepared,workflows),'retainedWitnesses');
   const versions=same(sourceVersionBinding(await readers.readRetainedVersions(prepared,collection),prepared,workflows,collection,recipe),'sourceVersions');
   same(candidateBinding(await readers.readCandidatePublication(prepared),prepared,recipe),'candidate');
   const current=same(proposerBinding(await readers.readCurrentProposer(prepared),prepared,reviews),'currentProposer');
   const archive=same(currentPreparationBinding(await readers.readCurrentPreparation(prepared,current),prepared,current),'currentPreparation');
   same(assess({prepared,collection,versions,current,archive,published:{predecessor:lineage.predecessor,
    version:lineage.version,tree:lineage.tree,archiveDigest:lineage.archiveDigest,producer:lineage.producer}}),'retainedAttempts');
   // Re-read native M/P/L and the full workflow collection after all readers;
   // no earlier stable GET is advertised as global/provider continuity.
   if(!available||!await bootstrap.reobserve())fail();
   return true;
  }catch{available=false;return false;}
  finally{busy=false;}
 };
 return Object.freeze({chart:stage.chart,resultStageId:stage.resultStageId,getBackend,reobserve});
}
