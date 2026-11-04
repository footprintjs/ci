import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import {jsonData,id} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottracePendingObservationReader,bindFoottracePendingReference} from './foottrace-pending.mjs';
const fail=()=>{throw new Error('metadata-required-checks-unavailable');};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Required CI/tested-tree/security INPUT only, using the SAME captured writer
 * owner and existing native policy. Failed/missing checks are not a fallback
 * permission. The complete owning C1 controller still owes actual current-run,
 * source/identity/history/writer admission and immediate all-predicate checks.
 */
export function createFoottraceMetadataCheckReader({transport,context}={}){
 const pinned=foottraceInvocationContext(context),owner=foottraceTransportPort(transport);
 if(owner.inspectionReadOnly||owner.repository.id!==pinned.repository.id)fail();
 return async input=>{
  const observations=[];
  try{
   const reference=bindFoottracePendingReference(input,pinned.sha);
   const port=foottraceTransportPort(transport,{requests:256,totalBytes:16*1024*1024});
   const observe=createFoottracePendingObservationReader({api:port.api,context:{repository:pinned.repository,sha:pinned.sha},settings:{slug:port.settings.slug}});
   const identity={repository:pinned.repository,headSha:reference.head,tree:reference.tree};
   const phase=async label=>{
    await native.assertCurrentMain(port.api,pinned);
    const before=await observe();
    if(!before.valid||!isDeepStrictEqual(before.reference,reference))fail();
    const ci=await native.ciVerdict(port.api,identity);
    if(ci.tested!==true)fail();
    const security=await native.requireSecurity(port.api,identity);
    const after=await observe();
    if(!after.valid||!isDeepStrictEqual(after.reference,reference))fail();
    await native.assertCurrentMain(port.api,pinned);
    const value=jsonData({reference,ci:{runId:id(ci.runId),attempt:id(ci.attempt)},
     security:{runId:id(security.runId),attempt:id(security.attempt)}});
    observations.push(Object.freeze({kind:'metadata-required-checks',phase:label,status:'projected',digest:digest(value)}));
    return value;
   };
   const before=await phase('initial'),after=await phase('recheck');
   if(!isDeepStrictEqual(before,after))fail();
   return Object.freeze({valid:true,scope:'metadata-required-checks-only',...after,digest:digest(after),
    writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,authorized:false,
    observations:Object.freeze(observations)});
  }catch{
   return Object.freeze({valid:false,reason:'metadata-required-checks-unavailable',authorized:false,
    observations:Object.freeze(observations)});
  }
 };
}
