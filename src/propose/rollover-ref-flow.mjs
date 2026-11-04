import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {decide} from 'footprintjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceRefSubmission} from './nonforce-ref-submission.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('rollover-ref-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Private ordinary CODE continuation. Only a returned exact ref response is an
 * ACK. Observed N/current INPUT never becomes submission attribution or retry
 * permission. A fixed private CODE continuation owns its separate PR phase.
 */
export function appendFoottraceRolloverRef({chart,captured,root,inspection,objects,recheck,completed,execution,state,continuation=null}){
 let port=null;try{port=foottraceTransportPort(captured.transport);}catch{/* Native root refuses invalid capture before this continuation. */}let pre=null,transition=null;
 let refAttempted=false,refMoved=false,refOutcome='not-attempted',refObserved=false;
 const ready=()=>!state().uncertain&&state().preparedHead!==null;
 const binding=()=>{
  const {baseline,preparedHead}=state(),p=baseline.prepared;
  const spec=bindProposalEffectRequest(captured.context.repository,{effect:'move-ref',payload:{sha:preparedHead,force:false}});
  return {headSha:preparedHead,baseSha:p.sourceSha,treeSha:p.targetTree,previousHeadSha:baseline.rollover.reference.retainedHeadSha,
   receiptRef:digest({body:spec.body,current:baseline.current.digest,archive:baseline.archive.digest,attempts:baseline.attempts.digest}),authorized:false};
 };
 const freshCompleted=()=>{
  const executor=execution(),s=executor.getSnapshot(),log=s.commitLog,row=log.findLast(x=>x.stageId==='rollover-ref-pre-effect');
  if(pre===null||executor.getCommitCount()!==log.length||!row||!isDeepStrictEqual(pre,binding())||
   !isDeepStrictEqual(row.overwrite?.rolloverRefPreEffect,pre)||!isDeepStrictEqual(s.sharedState.rolloverRefPreEffect,pre))fail();
 };
 chart=chart.addFunction('Initialize ordinary ref continuation after actual owning object phase',scope=>{
  if(port===null||root.getInvocationInput()!==captured||root.getBackend()===null||!completed('rollover-objects-terminal'))fail();
  scope.rolloverRefFacts={ready:ready(),refAcknowledged:false,refObserved:false,authorized:false,releaseReady:false};
 },'rollover-ref-inputs')
 .addDeciderFunction('Only acknowledged ordinary objects may reach a ref pre-effect',scope=>decide(scope,[
  {when:s=>s.rolloverRefFacts.ready&&ready(),then:'rollover-ref-pre-effect',label:'Commit exact N/M/L and native request binding'}
 ],'rollover-ref-skip-pre'),'rollover-ref-entry')
 .addFunctionBranch('rollover-ref-pre-effect','Commit the exact ordinary nonforce ref pre-effect',scope=>{
  pre=binding();scope.rolloverRefPreEffect=pre;
 })
 .addFunctionBranch('rollover-ref-skip-pre','Object uncertainty stops all later mutations',()=>{}).setDefault('rollover-ref-skip-pre').end()
 .addDeciderFunction('Current known object phase may submit ONE ref',scope=>decide(scope,[
  {when:s=>s.rolloverRefFacts.ready&&ready(),then:'rollover-ref-apply',label:'ALL old-L predicates, signed N, final current source/writer, force:false once'}
 ],'rollover-ref-skip-apply'),'rollover-ref-decision')
 .addFunctionBranch('rollover-ref-apply','Recheck complete native ordinary bindings before ONE ref submission',async scope=>{
  freshCompleted();await recheck();
  const {baseline,preparedHead}=state(),signed=await objects.commit(baseline.prepared,{sha:preparedHead});
  if(!signed.valid)fail();
  const retained=own(own(await port.api('GET','/repos/footprintjs/foottrace/git/ref/heads/release/next'),'data'),'object');
  if(own(retained,'type')!=='commit'||own(retained,'sha')!==baseline.rollover.reference.retainedHeadSha||!await root.reobserve())fail();
  freshCompleted();const effect=createFoottraceRefSubmission({transport:captured.transport,head:preparedHead});
  try{await effect.submit();}
  finally{const v=effect.observation();refAttempted=v.attempted;refMoved=v.moved;refOutcome=v.outcome;}
  if(!['acknowledged','uncertain'].includes(refOutcome))fail();
  // This invalidates old-L INPUT on both outcomes. The transition is READ-only
  // and never consumes the response as a grant; this flow owns its ACK itself.
  transition=inspection.createTransitionObserver();if(inspection.getBackend()!==null)fail();
  scope.rolloverRefFacts={...scope.rolloverRefFacts,refAcknowledged:refOutcome==='acknowledged'};
 })
 .addFunctionBranch('rollover-ref-skip-apply','No ref after uncertain objects',()=>{}).setDefault('rollover-ref-skip-apply').end()
 .addDeciderFunction('Any submitted ref receives only native GET observation',scope=>decide(scope,[
  {when:()=>refAttempted,then:'rollover-ref-get',label:'Never infer retry, rollback or PR authority from observed absence or N'}
 ],'rollover-ref-skip-get'),'rollover-ref-observe-decision')
 .addFunctionBranch('rollover-ref-get','Observe actual ref and complete ordinary N/M/L INPUT',async scope=>{
  const {baseline,preparedHead}=state(),raw=own(own(await port.api('GET','/repos/footprintjs/foottrace/git/ref/heads/release/next'),'data'),'object');
  if(own(raw,'type')!=='commit')fail();
  if(own(raw,'sha')===preparedHead){
   const value=await transition({head:preparedHead});if(!value.valid)fail();refObserved=true;
  }else if(refOutcome!=='uncertain'||own(raw,'sha')!==baseline.rollover.reference.retainedHeadSha)fail();
  if(!await root.reobserve())fail();
  scope.rolloverRefFacts={...scope.rolloverRefFacts,refObserved};
 })
 .addFunctionBranch('rollover-ref-skip-get','No ref submission to observe',()=>{}).setDefault('rollover-ref-skip-get').end()
 .addFunction('Record ordinary ref outcome without granting a later phase',scope=>{
  if(refOutcome==='acknowledged'&&!refObserved)fail();
  scope.rolloverRefResult={status:refOutcome==='acknowledged'?'advanced':'held',refOutcome,refMoved,refObserved,
   authorized:false,releaseReady:false,prPhaseImplemented:continuation!==null,nextPhaseAdmitted:false,mergeReleaseGatesStillRequired:true};
 },'rollover-ref-terminal');
 const next=continuation===null?null:continuation({chart,captured,root,completed,execution,
  state:()=>({...state(),refOutcome,refObserved,refMoved,refAttempted}),observeTransition:()=>transition});
 return Object.freeze({chart:next===null?chart:next.chart,resultStageId:next===null?'rollover-ref-terminal':next.resultStageId,
  status:()=>next===null?(refOutcome==='acknowledged'?'rollover-ref-advanced':'rollover-ref-verify-only'):next.status(),
  report:()=>({refAttempted,refOutcome,refMoved,refObserved,prPhaseImplemented:next!==null,nextPhaseAdmitted:false,
   mergeReleaseGatesStillRequired:true,...(next===null?{}:next.report())})});
}
