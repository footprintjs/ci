import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {decide} from 'footprintjs';
import native from '../guards/release-github.cjs';
import {appendFoottraceRolloverRef} from './rollover-ref-flow.mjs';
import {foottraceTransportPort,foottraceProposalEffectPort} from './foottrace-transport.mjs';
import {computeFoottraceProposalMetadata} from './computed-proposal-metadata.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {requireExactCreatedProposalReply} from './proposal-created-reply.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('ordinary-proposal-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Fixed private CODE composition, SAME owner/chart/log and native ref recipe.
 * No callback, root, executor, ACK or desired metadata can enter through DATA.
 */
export function appendFoottraceRolloverProposal(input){
 return appendFoottraceRolloverRef({...input,continuation:appendCreate});
}
function appendCreate({chart,captured,root,completed,execution,state,observeTransition}){
 let port=null;try{port=foottraceTransportPort(captured.transport);}catch{/* Native root refuses invalid capture before this continuation. */}
 let pre=null,payload=null,used=false,prAttempted=false,prSubmission='not-attempted',prCreated=false,prObserved=false,prNumber=null;
 const ready=()=>state().refOutcome==='acknowledged'&&state().refObserved===true&&!state().uncertain&&state().preparedHead!==null;
 const binding=()=>{
  const {baseline,preparedHead}=state(),p=baseline.prepared;
  const spec=bindProposalEffectRequest(captured.context.repository,{effect:'create-pr',payload:{...payload,head:'release/next',base:'main'}});
  return {headSha:preparedHead,baseSha:p.sourceSha,treeSha:p.targetTree,receiptRef:digest({body:spec.body,
   archive:baseline.archive.digest,current:baseline.current.digest,attempts:baseline.attempts.digest}),authorized:false};
 };
 const freshCompleted=()=>{
  const executor=execution(),s=executor.getSnapshot(),log=s.commitLog,row=log.findLast(x=>x.stageId==='rollover-pr-pre-effect');
  if(pre===null||executor.getCommitCount()!==log.length||!row||!isDeepStrictEqual(pre,binding())||
   !isDeepStrictEqual(row.overwrite?.rolloverPrPreEffect,pre)||!isDeepStrictEqual(s.sharedState.rolloverPrPreEffect,pre))fail();
 };
 const exact=(reply,pr)=>requireExactCreatedProposalReply(reply,{pr,head:state().preparedHead,base:state().baseline.prepared.sourceSha,
  botId:state().baseline.current.identity.botId,botLogin:port.settings.slug+'[bot]',repository:captured.context.repository,payload});
 chart=chart.addFunction('Join actual owning ref terminal with exact computed proposal DATA',scope=>{
  if(port===null||root.getInvocationInput()!==captured||root.getBackend()===null||!completed('rollover-ref-terminal'))fail();
  if(ready())payload=computeFoottraceProposalMetadata(state().baseline.prepared);
  scope.rolloverPrFacts={ready:ready(),attempted:false,observed:false,authorized:false,releaseReady:false};
 },'rollover-pr-inputs')
 .addDeciderFunction('Only exact same-invocation native object/ref ACKs admit PR preparation',scope=>decide(scope,[
  {when:s=>s.rolloverPrFacts.ready&&ready(),then:'rollover-pr-pre-effect',label:'Bind exact computed request and native N/M/L/source/archive'}
 ],'rollover-pr-skip-pre'),'rollover-pr-entry')
 .addFunctionBranch('rollover-pr-pre-effect','Commit ONE exact create-PR native pre-effect',scope=>{
  pre=binding();scope.rolloverPrPreEffect=pre;
 })
 .addFunctionBranch('rollover-pr-skip-pre','Uncertain ref or objects stop PR creation',()=>{}).setDefault('rollover-pr-skip-pre').end()
 .addDeciderFunction('Known native predecessor admits fresh create-PR checks',scope=>decide(scope,[
  {when:s=>s.rolloverPrFacts.ready&&ready(),then:'rollover-pr-apply',label:'Complete current native N/M/L eligibility and final actual writer before ONE create'}
 ],'rollover-pr-skip-apply'),'rollover-pr-decision')
 .addFunctionBranch('rollover-pr-apply','Recheck complete native INPUT and actual source/current writer immediately before create',async scope=>{
  freshCompleted();if(!ready()||observeTransition()===null)fail();
  const input=await observeTransition()({head:state().preparedHead});
  if(!input.valid||!await root.reobserve())fail();freshCompleted();
  if(used)fail();used=true;
  const effect=foottraceProposalEffectPort(captured.transport,{effect:'create-pr',payload:{...payload,head:'release/next',base:'main'}});
  let reply;prAttempted=true;prCreated=null;
  try{reply=await effect.submit();}catch{prSubmission=effect.observation().state;if(prSubmission!=='uncertain')fail();}
  prSubmission=effect.observation().state;
  if(prSubmission==='returned'){prNumber=exact(reply,null);prSubmission='acknowledged';prCreated=true;}
  else if(prSubmission!=='uncertain')fail();
  scope.rolloverPrFacts={...scope.rolloverPrFacts,attempted:true};
 })
 .addFunctionBranch('rollover-pr-skip-apply','No create after non-idempotent uncertainty',()=>{}).setDefault('rollover-pr-skip-apply').end()
 .addDeciderFunction('Submitted create-PR receives GET-only verification',scope=>decide(scope,[
  {when:()=>prAttempted,then:'rollover-pr-get',label:'No retry, rollback or inferred-absence grant'}
 ],'rollover-pr-skip-get'),'rollover-pr-observe-decision')
 .addFunctionBranch('rollover-pr-get','Rejoin ONE exact observed App PR or verify still-zero INPUT after uncertainty',async scope=>{
  if(prSubmission==='uncertain'){
   const rows=await native.pages(port.api,'/repos/footprintjs/foottrace/pulls?state=all&head=footprintjs:release/next&base=main');
   if(rows.length>256)fail();const open=rows.filter(p=>own(p,'state')==='open');
   if(open.length>1)fail();if(open.length===1)prNumber=exact({data:open[0]},null);
  }
  const input=prNumber===null?await observeTransition()({head:state().preparedHead})
   :await observeTransition().forCreatedProposal(prNumber)({head:state().preparedHead});
  if(!input.valid||!await root.reobserve())fail();prObserved=prNumber!==null;
  if(prSubmission==='acknowledged'&&!prObserved)fail();
  scope.rolloverPrFacts={...scope.rolloverPrFacts,observed:prObserved};
 })
 .addFunctionBranch('rollover-pr-skip-get','No PR submission to verify',()=>{}).setDefault('rollover-pr-skip-get').end()
 .addFunction('Record native ordinary proposal outcome without release authority',scope=>{
  if(prSubmission==='acknowledged'&&!prObserved)fail();
  scope.rolloverPrResult={status:prSubmission==='acknowledged'?'proposed':'held',prSubmission,prCreated,prObserved,prNumber,
   authorized:false,releaseReady:false,nextPhaseAdmitted:false,mergeReleaseGatesStillRequired:true};
 },'rollover-pr-terminal');
 return Object.freeze({chart,resultStageId:'rollover-pr-terminal',
  status:()=>prSubmission==='acknowledged'?'rollover-proposed':'rollover-proposal-verify-only',
  report:()=>({prAttempted,prSubmission,prCreated,prObserved,prNumber,nextPhaseAdmitted:false,releaseReady:false})});
}
