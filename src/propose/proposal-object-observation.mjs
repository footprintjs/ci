import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import native from '../guards/release-github.cjs';
import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceProposerObservation} from './current-proposer.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {bindConfiguredAppCommit} from './configured-app-commit.mjs';
import {createFoottraceRolloverInputReader} from './foottrace-rollover-inputs.mjs';
import {createFoottraceLineageObservationReader} from './foottrace-lineage.mjs';
import {bindOrdinaryPublishedObservation} from './rollover-published-binding.mjs';
const fail=()=>{throw new Error('proposal-object-observation-unavailable');};
const sha=v=>{if(!control.validSha(v))fail();return v;};
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const result=object=>Object.freeze({valid:true,scope:'proposal-object-observation-only',object:Object.freeze(object),
 originalProducerAttributed:false,submissionAcknowledged:false,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,authorized:false});
const unavailable=()=>Object.freeze({valid:false,reason:'proposal-object-observation-unavailable',authorized:false});
/** SAME-owner GET observations only. Presence/bytes/signature cannot prove our
 * submission, exact original producer, writer grant or retry permission.
 * Unknown non-idempotent submissions remain GET-only/HOLD across invocations.
 * The owning native flow must prove its actual pre-effect and fresh guards.
 */
export function createFoottraceProposalObjectReader({transport,context}={}){
 const pinned=foottraceInvocationContext(context);
 return createObjectReader({transport,context:pinned},async p=>{
  const parents=jsonData(own(p,'proposedParents'));
  if(!isDeepStrictEqual(parents,[pinned.sha,sha(own(p,'pendingSha'))]))fail();
  return parents;
 });
}
/** Separate trusted CODE parent role. Ordinary source remains ordinary; no
 * pendingSha/proposedParents coercion or DATA-selected parent strategy. Native
 * L/ref/preparation is reacquired around object observations, never a grant.
 */
export function createFoottraceRolloverObjectReader({transport,context}={}){
 const readRollover=createFoottraceRolloverInputReader({transport,context});
 return createObjectReader({transport,context},async p=>{
  const actual=await readRollover(p);
  if(!actual.valid||actual.scope!=='closed-published-rollover-inputs-only'||actual.authorized!==false)fail();
  const parents=jsonData(actual.reference.nextParents);
  if(!isDeepStrictEqual(parents,[p.sourceSha,sha(actual.reference.predecessor.head)]))fail();
  return parents;
 });
}
/** Private post-ref CODE role, bound to fresh published L rather than a false
 * retained-L ref. This is the SAME signed-object observer, not an ACK/grant.
 */
export function createFoottraceRolloverTransitionObjectReader({transport,context},baseline){
 const port=foottraceTransportPort(transport),pinned=foottraceInvocationContext(context);
 const published=createFoottraceLineageObservationReader({transport:port,context:{repository:pinned.repository,sha:pinned.sha},settings:port.settings});
 return createObjectReader({transport,context:pinned},async p=>{
  if(!isDeepStrictEqual(p,baseline.prepared))fail();
  const actual=bindOrdinaryPublishedObservation(await published(),baseline);
  return [p.sourceSha,actual.predecessor.head];
 });
}
// One bounded blob/tree/signed-App observer; parent admission is trusted CODE
// captured by the two fixed entries above, never supplied by public DATA.
function createObjectReader({transport,context},readParents){
 const pinned=foottraceInvocationContext(context),port=foottraceTransportPort(transport);
 if(!control.sameRepo(pinned.repository,port.repository))fail();
 const readCurrent=createFoottraceProposerObservation({transport,context:pinned});
 const preparedInput=p=>{
  if(own(p,'valid')!==true||own(p,'sourceSha')!==pinned.sha)fail();
  sha(own(p,'sourceTree'));return sha(own(p,'targetTree'));
 };
 const identity=async p=>{
  const v=await readCurrent(p);
  if(!v.valid||v.scope!=='current-proposer-identity-only'||v.authorized!==false||v.writerCredentialBindingAdmitted!==false||
   v.retainedEligibilityAdmitted!==false||v.privateAppIdentityAdmitted!==false||v.keyHolderIdentityFactsObserved!==true||
   v.appIdentityObservation!=='cached-key-holder-facts')fail();
  return v;
 };
 const blob=async input=>{
  try{
   const spec=bindProposalEffectRequest(port.repository,{effect:'create-blob',payload:input}),bytes=Buffer.from(spec.payload.content),
    oid=preparation.gitObject('blob',bytes);
   for(let phase=0;phase<2;phase++){
    const actual=await native.sourceView(port.api,pinned).blob(oid);
    if(!actual.equals(bytes))fail();
   }
   return result({kind:'blob',sha:oid,bytes:bytes.length,contentDigest:createHash('sha256').update(bytes).digest('hex')});
  }catch{return unavailable();}
 };
 const tree=async p=>{
  try{
   const oid=preparedInput(p);let before=null,entries=0;
   for(let phase=0;phase<2;phase++){
    const inventory=await native.sourceView(port.api,pinned).tree(oid);
    const rows=[...inventory].map(([path,row])=>({path,mode:row.mode,sha:row.sha})).sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
    const current=digest(rows);if(before!==null&&current!==before)fail();before=current;entries=rows.length;
   }
   return result({kind:'tree',sha:oid,entries,inventoryDigest:before});
  }catch{return unavailable();}
 };
 const commit=async(p,input)=>{
  try{
   const tree=preparedInput(p),request=fields(jsonData(input),['sha']),head=sha(request.sha),
    parents=await readParents(p);
   let expected=null,before=null;
   for(let phase=0;phase<2;phase++){
    const current=await identity(p);
    if(expected!==null&&current.digest!==expected.digest)fail();expected=current;
    const raw=own(await port.api('GET','/repos/'+port.repository.full_name+'/commits/'+head),'data');
    const v=bindConfiguredAppCommit(raw,{head,tree,parents,botId:current.identity.botId,botLogin:port.settings.slug+'[bot]'});
    if(before!==null&&!isDeepStrictEqual(before,v))fail();before=v;
    if(!isDeepStrictEqual(await readParents(p),parents))fail();
    const after=await identity(p);if(after.digest!==expected.digest)fail();
   }
   return result({kind:'commit',head,tree,parents,botId:expected.identity.botId,verified:true,reason:'valid',currentIdentityDigest:expected.digest});
  }catch{return unavailable();}
 };
 return Object.freeze({blob,tree,commit});
}
