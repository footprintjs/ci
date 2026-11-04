import {computeFoottraceProposalMetadata} from './computed-proposal-metadata.mjs';
import {isDeepStrictEqual} from 'node:util';
import {decide} from 'footprintjs';
import {foottraceTransportPort,foottraceMetadataPatchPort} from './foottrace-transport.mjs';
import {createFoottracePendingObservationReader} from './foottrace-pending.mjs';
import {createFoottraceProposalMetadataReader} from './proposal-metadata.mjs';
import {requireExactProposalMetadataReply} from './proposal-metadata-reply.mjs';
import {createFoottraceRefSubmission} from './nonforce-ref-submission.mjs';
const fail=()=>{throw new Error('pending-refresh-unavailable');};
/** Private CODE continuation on the SAME owning chart/executor. No completion,
 * root/writer port, callback or effect plan is accepted by public DATA facades.
 * Exact9eb222ce permits NO CI predicate only at this THIS-invocation metadata
 * boundary after known ref ACK. Merge/release gates and standalone C1 unchanged.
 */
export function appendFoottracePendingRefresh({chart,captured,root,inspection,objects,recheck,completed,execution,state}){
 let refOutcome='not-attempted',refMoved=false,refVerified=false,refAttempted=false;
 let observeTransition=null,metadata=null,metadataPatchAttempts=0,metadataSubmission='not-attempted',metadataVerified=false,metadataMatches=false;
 let status='refresh-verify-only',refPre=null,metadataPre=null;
 let pending=null,readMetadata=null;
 try{
  const port=foottraceTransportPort(captured.transport),options={api:port.api,
   context:{repository:captured.context.repository,sha:captured.context.sha},settings:{slug:port.settings.slug}};
  pending=createFoottracePendingObservationReader(options);readMetadata=createFoottraceProposalMetadataReader(options);
 }catch{/* Invalid capture is refused by the SAME native root/boundary, never an eager constructor escape. */}
 const ready=()=>!state().uncertain&&state().preparedHead!==null;
 const exactN=reference=>{
  const {baseline,preparedHead}=state(),p=baseline.prepared,prior=baseline.pending.reference;
  return reference.head===preparedHead&&reference.tree===p.targetTree&&reference.pr===prior.pr&&reference.botId===prior.botId&&
   reference.source===p.sourceSha&&isDeepStrictEqual(reference.parents,[p.sourceSha,p.pendingSha]);
 };
 const freshCompleted=(id,key,expected)=>{
  const executor=execution(),snapshot=executor.getSnapshot(),log=snapshot.commitLog;
  if(expected===null||executor.getCommitCount()!==log.length)fail();
  const row=log.findLast(r=>r.stageId===id);
  if(!row||!isDeepStrictEqual(row.overwrite?.[key],expected)||!isDeepStrictEqual(snapshot.sharedState[key],expected))fail();
 };
 const metadataRecheck=async()=>{
  if(refOutcome!=='acknowledged'||!refVerified||observeTransition===null||metadata===null)fail();
  const value=await observeTransition({head:state().preparedHead});
  const join=v=>({reference:v.pending.reference,desired:v.metadata.desiredDigest,observed:v.metadata.observedDigest,matches:v.metadata.matches});
  if(!value.valid||!isDeepStrictEqual(join(value),join(metadata))||!await root.reobserve())fail();
  return value;
 };
 chart=chart.addFunction('Initialize same-invocation native ref and metadata continuation',scope=>{
  if(pending===null||readMetadata===null||!completed('pending-successor-terminal'))fail();
  scope.pendingRefreshFacts={ready:ready(),refAcknowledged:false,refVerified:false,metadataPlanned:false,metadataMatched:false,authorized:false,releaseReady:false};
 },'pending-refresh-inputs')
 .addDeciderFunction('Only acknowledged object preparation may attempt a ref',scope=>decide(scope,[
  {when:s=>s.pendingRefreshFacts.ready&&ready(),then:'pending-refresh-ref-pre-effect',label:'Commit actual exact nonforce ref decision'}
 ],'pending-refresh-skip-ref-pre'),'pending-refresh-ref-entry')
 .addFunctionBranch('pending-refresh-ref-pre-effect','Commit the ONE exact release/next ref pre-effect',scope=>{
  const {baseline,preparedHead}=state();refPre={headSha:preparedHead,baseSha:baseline.prepared.sourceSha,
   treeSha:baseline.prepared.targetTree,receiptRef:baseline.checks.digest,authorized:false};
  scope.pendingRefreshRefPreEffect=refPre;
 })
 .addFunctionBranch('pending-refresh-skip-ref-pre','Uncertain objects stop every later mutation',()=>{}).setDefault('pending-refresh-skip-ref-pre').end()
 .addDeciderFunction('Known object phase has a current ref decision',scope=>decide(scope,[
  {when:s=>s.pendingRefreshFacts.ready&&ready(),then:'pending-refresh-ref-apply',label:'Immediately ALL old-P/source/currentwriter predicates, signed N, then force:false once'}
 ],'pending-refresh-skip-ref'),'pending-refresh-ref-decision')
 .addFunctionBranch('pending-refresh-ref-apply','Recheck native state before the ONE nonforce ref submission',async scope=>{
  freshCompleted('pending-refresh-ref-pre-effect','pendingRefreshRefPreEffect',refPre);
  await recheck();
  const {baseline,preparedHead}=state(),signed=await objects.commit(baseline.prepared,{sha:preparedHead});
  if(!signed.valid||!await root.reobserve())fail();
  freshCompleted('pending-refresh-ref-pre-effect','pendingRefreshRefPreEffect',refPre);
  const effect=createFoottraceRefSubmission({transport:captured.transport,head:preparedHead});
  try{await effect.submit();}
  finally{const value=effect.observation();refAttempted=value.attempted;refMoved=value.moved;refOutcome=value.outcome;}
  if(refOutcome==='acknowledged')observeTransition=inspection.createTransitionObserver();
  else if(refOutcome==='uncertain')inspection.invalidate();
  else fail();
  if(inspection.getBackend()!==null)fail();
  scope.pendingRefreshFacts={...scope.pendingRefreshFacts,refAcknowledged:refOutcome==='acknowledged'};
 })
 .addFunctionBranch('pending-refresh-skip-ref','No ref effect after object uncertainty',()=>{}).setDefault('pending-refresh-skip-ref').end()
 .addDeciderFunction('Any ref submission goes to GET-only native observation',scope=>decide(scope,[
  {when:()=>refAttempted,then:'pending-refresh-ref-get',label:'No inferred-absence ref retry, rollback or metadata after uncertainty'}
 ],'pending-refresh-skip-ref-get'),'pending-refresh-ref-verify-decision')
 .addFunctionBranch('pending-refresh-ref-get','GET-observe actual M and the SAME single App PR/ref',async scope=>{
  const value=await pending();if(!value.valid)fail();
  refVerified=exactN(value.reference);
  if(!refVerified&&(refOutcome!=='uncertain'||!isDeepStrictEqual(value.reference,state().baseline.pending.reference)))fail();
  if(refVerified){const signed=await objects.commit(state().baseline.prepared,{sha:state().preparedHead});if(!signed.valid)fail();}
  if(!await root.reobserve())fail();
  scope.pendingRefreshFacts={...scope.pendingRefreshFacts,refVerified};
 })
 .addFunctionBranch('pending-refresh-skip-ref-get','No submitted ref to observe',()=>{}).setDefault('pending-refresh-skip-ref-get').end()
 .addDeciderFunction('Only exact ACKed ref enters post-ref metadata admission',scope=>decide(scope,[
  {when:()=>refOutcome==='acknowledged'&&refVerified,then:'pending-refresh-read-metadata',label:'Reacquire SAME source/witness/history/native authority; NO CI predicate for this setter'}
 ],'pending-refresh-skip-metadata'),'pending-refresh-metadata-entry')
 .addFunctionBranch('pending-refresh-read-metadata','Plan exact N metadata; full non-CI admission follows committed pre-effect',async scope=>{
  // Plan DATA only: current actual N/metadata and THIS preparation's payload.
  // The COMPLETE source/witness/history/current-writer recipe is mandatory
  // AFTER the owning pre-effect commit, immediately before noop or PATCH.
  const current=await pending();if(!current.valid||!exactN(current.reference))fail();
  const payload=computeFoottraceProposalMetadata(state().baseline.prepared),observed=await readMetadata(current.reference,payload);
  if(!observed.valid)fail();
  metadata={pending:current,payload,metadata:observed};
  metadataMatches=observed.matches;
  scope.pendingRefreshFacts={...scope.pendingRefreshFacts,metadataPlanned:true,metadataMatched:metadataMatches};
 })
 .addFunctionBranch('pending-refresh-skip-metadata','Non-idempotent uncertainty remains verify-only',()=>{}).setDefault('pending-refresh-skip-metadata').end()
 .addDeciderFunction('Observed deterministic metadata plan gets an actual native pre-effect',scope=>decide(scope,[
  {when:s=>s.pendingRefreshFacts.metadataPlanned,then:'pending-refresh-metadata-pre-effect',label:'Exact current N/payload digest; no N CI or release claim'}
 ],'pending-refresh-skip-metadata-pre'),'pending-refresh-metadata-pre-decision')
 .addFunctionBranch('pending-refresh-metadata-pre-effect','Commit exact same-PR metadata pre-effect',scope=>{
  metadataPre={headSha:state().preparedHead,treeSha:state().baseline.prepared.targetTree,
   receiptRef:metadata.metadata.desiredDigest,authorized:false};
  scope.pendingRefreshMetadataPreEffect=metadataPre;
 })
 .addFunctionBranch('pending-refresh-skip-metadata-pre','No metadata authority from uncertain ref',()=>{}).setDefault('pending-refresh-skip-metadata-pre').end()
 .addDeciderFunction('Deterministic current N metadata exact or stale',scope=>decide(scope,[
  {when:s=>s.pendingRefreshFacts.metadataPlanned&&metadataMatches,then:'pending-refresh-metadata-noop',label:'ALL non-CI rechecks, exact metadata needs zero writes'},
  {when:s=>s.pendingRefreshFacts.metadataPlanned&&!metadataMatches,then:'pending-refresh-metadata-apply',label:'ALL non-CI rechecks then ONE exact idempotent setter'}
 ],'pending-refresh-metadata-unavailable'),'pending-refresh-metadata-effect-decision')
 .addFunctionBranch('pending-refresh-metadata-noop','Recheck actual exact metadata without mutation',async()=>{
  freshCompleted('pending-refresh-metadata-pre-effect','pendingRefreshMetadataPreEffect',metadataPre);
  const fresh=await metadataRecheck();if(!fresh.metadata.matches)fail();metadataVerified=true;
 })
 .addFunctionBranch('pending-refresh-metadata-apply','Recheck immediately before ONE exact same-PR title/body PATCH',async()=>{
  freshCompleted('pending-refresh-metadata-pre-effect','pendingRefreshMetadataPreEffect',metadataPre);
  const fresh=await metadataRecheck();if(fresh.metadata.matches)fail();
  freshCompleted('pending-refresh-metadata-pre-effect','pendingRefreshMetadataPreEffect',metadataPre);
  const effect=foottraceMetadataPatchPort(captured.transport,{pullNumber:fresh.pending.reference.pr,desired:fresh.payload});let reply;
  try{metadataPatchAttempts++;reply=await effect.setExact();}catch{metadataSubmission=effect.observation().state;if(metadataSubmission!=='uncertain')fail();}
  metadataSubmission=effect.observation().state;
  if(metadataSubmission==='returned')requireExactProposalMetadataReply(reply,fresh.pending.reference,fresh.payload,captured.context.repository);
  else if(metadataSubmission!=='uncertain')fail();
  const observed=await readMetadata(fresh.pending.reference,fresh.payload);if(!observed.valid)fail();
  if(!observed.matches&&metadataSubmission!=='uncertain')fail();
  metadataMatches=observed.matches;metadataVerified=true;
 })
 .addFunctionBranch('pending-refresh-metadata-unavailable','No metadata work after ref/object uncertainty',()=>{}).setDefault('pending-refresh-metadata-unavailable').end()
 .addFunction('Record metadata reconciliation for N only, never N verification',scope=>{
  if(refOutcome==='acknowledged'){
   if(!refVerified||!metadataVerified)fail();status=metadataMatches?'metadata-reconciled':'metadata-hold';
  }else if(refAttempted&&refOutcome!=='uncertain')fail();
  scope.pendingRefreshResult={status:status==='metadata-reconciled'?'match':'held',headSha:state().preparedHead??state().baseline.prepared.pendingSha,
   metadataVerified,authorized:false,releaseReady:false,ciForMetadataRequired:false,mergeReleaseGatesStillRequired:true};
 },'pending-refresh-terminal');
 return Object.freeze({chart,resultStageId:'pending-refresh-terminal',status:()=>status,report:()=>({
  refOutcome,refMoved,metadataPatchAttempts,metadataSubmission,ciForMetadataRequired:false,mergeReleaseGatesStillRequired:true,
  metadataLabel:metadataVerified?(metadataMatches?'metadata reconciled for N':'metadata stale for N'):'unavailable',nextPhaseAdmitted:false})});
}
