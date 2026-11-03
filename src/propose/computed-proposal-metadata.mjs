import {bindProposalMetadata} from './proposal-metadata-payload.mjs';
import native from '../guards/release-github.cjs';
import {own} from './source-inventory.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceProposalMetadataReader} from './proposal-metadata.mjs';
const fail=()=>{throw new Error('computed-metadata-unavailable');};
/** Pure bounded projection of an independently reconstructed current preparation.
 * Actual source/archive admission is separate. No caller-supplied title/body,
 * saved approval or writer authority is accepted or created here.
 */
export function computeFoottraceProposalMetadata(prepared){
 const version=own(prepared,'version'),actual=own(prepared,'prepared'),notes=own(actual,'notes');
 if(typeof version!=='string'||! /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)||
  version.length>128||own(actual,'version')!==version||typeof notes!=='string'||
  Buffer.byteLength(notes)>65536||Buffer.from(notes).toString('utf8')!==notes)fail();
 return bindProposalMetadata(native.proposalMetadata(version,notes),true);
}
/** Current actual GET observations against the ONE native policy formatter.
 * The payload remains in trusted runtime backend data; only exact digests/match
 * facts belong in native scope. This reader is not permission to PATCH.
 */
export function createFoottraceComputedMetadataReader({transport,context}={}){
 const pinned=foottraceInvocationContext(context),port=foottraceTransportPort(transport);
 if(port.repository.id!==pinned.repository.id)fail();
 const read=createFoottraceProposalMetadataReader({api:port.api,context:{repository:pinned.repository,sha:pinned.sha},settings:{slug:port.settings.slug}});
 return async(prepared,pending)=>{
  try{
   const reference=own(pending,'reference');
   if(own(prepared,'scope')!=='current-prepared-inputs-only'||own(prepared,'sourceSha')!==pinned.sha||
    own(reference,'source')!==pinned.sha||own(reference,'tree')!==own(prepared,'targetTree'))fail();
   const payload=computeFoottraceProposalMetadata(prepared),observation=await read(reference,payload);
   if(!observation.valid)fail();
   return Object.freeze({valid:true,scope:'computed-current-metadata-only',payload,observation,
    authorized:false,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,executedWrites:0});
  }catch{return Object.freeze({valid:false,reason:'computed-metadata-unavailable',authorized:false,executedWrites:0});}
 };
}
