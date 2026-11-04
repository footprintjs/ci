import {isDeepStrictEqual} from 'node:util';
import {createFoottraceProposeInspection} from './foottrace-inspection.mjs';
import {createFoottraceMetadataCheckReader} from './foottrace-metadata-checks.mjs';
import {createFoottracePendingReader} from './foottrace-pending.mjs';
import {createFoottraceProposerObservation} from './current-proposer.mjs';
import {createObservedAppCommitReader} from './observed-app-commit.mjs';
import {createFoottraceProposalObjectReader} from './proposal-object-observation.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {own} from './source-inventory.mjs';
import {createFoottracePendingObjectPlan} from './proposal-object-plan.mjs';
import {appendFoottracePendingObjectPhase} from './proposal-object-flow.mjs';
const fail=()=>{throw new Error('pending-successor-unavailable');};
const semantic=value=>Object.fromEntries(['sourceSha','sourceTree','targetTree','fromVersion','version','queue','prepared'].map(k=>[k,own(value,k)]));
/** Private CODE composition of the SAME pending preparation/refresh chart.
 * The enclosing route owns one capture, chart and actual executor. Model DATA
 * never selects a continuation, writer, completion predicate or execution port.
 * No nested executor or source/effect/production-caller clearance is introduced.
 */
export function appendFoottracePendingSuccessor({chart:start,captured,root,completed,execution,continuation=null}){
 let baseline=null,checks,readPending,readSigned,objects,plan=null;
 try{
  const port=foottraceTransportPort(captured.transport),context=captured.context;
  checks=createFoottraceMetadataCheckReader(captured);objects=createFoottraceProposalObjectReader(captured);
  readPending=createFoottracePendingReader({api:port.api,context:{repository:context.repository,sha:context.sha},settings:{slug:port.settings.slug}});
  readSigned=createObservedAppCommitReader({api:port.api,repository:port.repository,settings:port.settings,
   readCurrentProposer:createFoottraceProposerObservation(captured)});
 }catch{/* Invalid capture cannot acquire an effect port or bypass the native root. */}
 const predecessor=start.addFunction('Require the actual completed native writer source prefix',()=>{
  if(root.getInvocationInput()!==captured||root.getBackend()===null||!completed(root.resultStageId)||!checks||!objects||!readPending||!readSigned)fail();
 },'pending-successor-root-boundary');
 const inspection=createFoottraceProposeInspection(captured??{},predecessor);
 const eligible=b=>b!==null&&b.retainedAttempts?.valid===true&&b.retainedAttempts.eligible===true;
 const observe=async()=>{
  const b=inspection.getBackend(),current=root.getBackend();
  if(!eligible(b)||current===null||!isDeepStrictEqual(semantic(current.prepared),semantic(b.prepared))||
   current.current.digest!==b.currentProposer.digest)fail();
  const pending=await readPending(b.prepared);if(!pending.valid)fail();
  const required=await checks(pending.reference);if(!required.valid)fail();
  const signed=await readSigned(b.prepared,pending,current.current);if(!signed.valid)fail();
  return {prepared:b.prepared,pending,checks:required,signed};
 };
 const recheck=async()=>{
  // Reacquire all native history first; the mandatory final root/source/current-writer recheck below is the last provider await before EVERY submission.
  if(baseline===null||!await inspection.reobserveEffects())fail();
  const fresh=await observe();
  const binding=v=>({prepared:semantic(v.prepared),pending:v.pending.reference,checks:v.checks.digest,signed:v.signed.digest});
  if(!isDeepStrictEqual(binding(fresh),binding(baseline))||!await root.reobserve())fail();
 };
 let chart=inspection.chart.addFunction('Join actual pending eligibility, signed App state and required checks',async scope=>{
  if(!completed(inspection.resultStageId)||!eligible(inspection.getBackend())||!await root.reobserve())fail();
  baseline=await observe();plan=createFoottracePendingObjectPlan({repository:captured.context.repository,prepared:baseline.prepared});
  scope.pendingSuccessorFacts={count:0,executedWrites:0,verified:false,authorized:false,releaseReady:false};
 },'pending-successor-inputs');
 const phase=appendFoottracePendingObjectPhase({chart,captured,execution,recheck,objects,
  getInput:()=>({prepared:baseline?.prepared,previousHead:baseline?.prepared.pendingSha,plan})});
 chart=phase.chart;
 let refresh=null;
 if(continuation!==null){
  refresh=continuation({chart,captured,root,inspection,objects,recheck,completed,
   execution,state:()=>({baseline,...phase.state()})});
  chart=refresh.chart;
 }
 return Object.freeze({chart,resultStageId:refresh===null?phase.resultStageId:refresh.resultStageId,
  status:()=>refresh===null?(phase.state().uncertain?'successor-verify-only':'successor-prepared'):refresh.status(),
  report:()=>{
   const {verified,...facts}=phase.report();
   return {...facts,...(refresh===null?{verified}:{objectsVerified:verified}),
    originalProducerAttributed:false,writerCredentialBindingAdmitted:false,...(refresh===null?{}:refresh.report())};
  }});
}
