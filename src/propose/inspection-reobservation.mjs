import {sameInspectionFacts} from './observation-facts.mjs';
import {isDeepStrictEqual} from 'node:util';
import {packageProfile} from './package-profile.mjs';
import {createRetainedAttemptAssessor} from './retained-attempts.mjs';
import {lineageBinding,ancestryBinding,reviewBinding,workflowBinding,candidateBinding,
 sourceVersionBinding,retainedWitnessBinding,proposerBinding,currentPreparationBinding,ordinaryPreparationBinding} from './inspection-bindings.mjs';
const fail=()=>{throw new Error('propose-input-observation-drift');};
/** SAME binding recipe for old-P input rechecks and the CODE-only post-ref
 * observer. reviewCheck is a fixed production adapter, never forwarded DATA.
 * Source/witness/history/current bindings stay exact; this creates no grant.
 */
export async function reobserveInspectionBindings({baseline,readers,profile,retainedProfile,reviewCheck}){
 const recipe=packageProfile(profile),assess=createRetainedAttemptAssessor(retainedProfile),prepared=baseline.prepared;
 const same=(value,key)=>{if(!sameInspectionFacts(value,baseline[key]))fail();return value;};
 same(ordinaryPreparationBinding(await readers.readOrdinaryPreparation(prepared),prepared),'ordinaryPreparation');
 const lineage=same(lineageBinding(await readers.readLineage({sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,
  fromVersion:prepared.fromVersion,predecessor:prepared.predecessor}),prepared),'lineage');
 same(ancestryBinding(await readers.readAncestry(prepared),prepared),'ancestry');
 const reviews=reviewCheck===undefined?same(reviewBinding(await readers.readReviews(prepared),prepared,recipe),'reviews'):
  await reviewCheck(baseline.reviews);
 const collection=await readers.readWorkflows(),workflows=same(workflowBinding(collection,prepared),'workflows');
 same(retainedWitnessBinding(await readers.readRetainedWitnesses(prepared,collection),prepared,workflows),'retainedWitnesses');
 const versions=same(sourceVersionBinding(await readers.readRetainedVersions(prepared,collection),prepared,workflows,collection,recipe),'sourceVersions');
 same(candidateBinding(await readers.readCandidatePublication(prepared),prepared,recipe),'candidate');
 const current=same(proposerBinding(await readers.readCurrentProposer(prepared),prepared,reviews),'currentProposer');
 const archive=same(currentPreparationBinding(await readers.readCurrentPreparation(prepared,current),prepared,current),'currentPreparation');
 const attempts=assess({prepared,collection,versions,current,archive,published:{predecessor:lineage.predecessor,
  version:lineage.version,tree:lineage.tree,archiveDigest:lineage.archiveDigest,producer:lineage.producer}});
 if(!isDeepStrictEqual(attempts,baseline.retainedAttempts))fail();
 return Object.freeze({current,archive,collection});
}
/** Native mutable old-P anchors bracket the SAME binding recipe. Explicit
 * invalidation only removes INPUT knowledge; no saved authority is produced.
 */
export function createInspectionReobserver({stage,bootstrap,readers,profile,retainedProfile,readEffectAnchors}){
 let available=true,busy=false;
 const getBackend=()=>available?stage.getBackend():null;
 const invalidate=()=>{available=false;};
 const observeWith=async anchor=>{
  const baseline=getBackend();if(baseline===null)return false;
  if(busy){invalidate();return false;}busy=true;
  try{
   if(typeof anchor!=='function'||!await anchor(baseline))fail();
   await reobserveInspectionBindings({baseline,readers,profile,retainedProfile});
   if(!available)fail();
   const anchored=await anchor(baseline);
   if(!available||!anchored)fail();
   return true;
  }catch{invalidate();return false;}
  finally{busy=false;}
 };
 const reobserve=()=>observeWith(()=>bootstrap.reobserve());
 // Effect acquisition preserves REAL mutable M/P/PR/tree/parent anchors and
 // the SAME COMPLETE source/witness/workflow/version/current binding recipe.
 // Initial unique discovery remains mandatory; its complete workflow digest
 // is freshly compared by the recipe, so a new/ambiguous cohort cannot pass.
 // This removes duplicate discovery work, not any admitted predicate.
 const reobserveEffects=()=>observeWith(readEffectAnchors);
 return Object.freeze({chart:stage.chart,resultStageId:stage.resultStageId,getBackend,reobserve,reobserveEffects,invalidate});
}
