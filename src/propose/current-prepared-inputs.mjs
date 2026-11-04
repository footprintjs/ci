import {packageProfile} from './package-profile.mjs';
import {createPreparedSourceReader} from './prepared-source.mjs';
import {keys,own} from './source-inventory.mjs';
/** Independently reconstructed current target, without historical creator
 * attribution or a pending refresh chain. This never permits ref movement.
 * Native kind/date/current archive/lineage/eligibility remain independent.
 */
export function createCurrentPreparedInputReader(inputProfile) {
 const profile=packageProfile(inputProfile),read=createPreparedSourceReader({packageName:profile.packageName,prepare:profile.prepare,dateLaw:profile.dateLaw});
 return input=>{
  try{
   keys(input,['source','preparationDate']);
   const v=read(own(input,'source'),own(input,'preparationDate'));
   if(!v.valid)throw new Error();
   return Object.freeze({valid:true,scope:'current-prepared-inputs-only',profileId:profile.id,packageName:profile.packageName,
    sourceSha:v.sourceSha,sourceTree:v.sourceTree,targetTree:v.tree,preparationDate:v.date,
    version:v.prepared.version,fromVersion:v.prepared.fromVersion,queue:v.queue,prepared:v.prepared,
    authorized:false,originalProducerAttributed:false});
  }catch{return Object.freeze({valid:false,reason:'current-prepared-inputs-unavailable',authorized:false});}
 };
}
