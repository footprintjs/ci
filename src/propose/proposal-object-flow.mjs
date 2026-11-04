import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {decide} from 'footprintjs';
import control from '../guards/release-control.cjs';
import {foottraceProposalEffectPort} from './foottrace-transport.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('proposal-object-phase-unavailable');};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rowInput=row=>({effect:row.effect,payload:row.payload});
/** Fixed trusted CODE namespaces; no public DATA selects ports, parent roles,
 * scope names or native completion. The caller supplies its actually admitted
 * baseline and complete immediate source/history/writer recheck. This shared
 * phase owns the SAME executor's per-object pre-effect/submit/verify loop only.
 */
export function appendFoottracePendingObjectPhase(options){
 return appendObjectPhase(options,{prefix:'pending-successor',facts:'pendingSuccessorFacts',preEffect:'pendingSuccessorPreEffect',result:'pendingSuccessorResult'});
}
export function appendFoottraceRolloverObjectPhase(options){
 return appendObjectPhase(options,{prefix:'rollover-objects',facts:'rolloverObjectFacts',preEffect:'rolloverObjectPreEffect',result:'rolloverObjectResult'});
}
function appendObjectPhase({chart:start,captured,execution,recheck,objects,getInput},ids){
 let plan=null,prepared=null,previousHead=null,index=0;
 let attempted=0,acknowledged=0,submission='not-attempted',uncertain=false,verified=false,preparedHead=null;
 const bindInput=()=>{
  const value=getInput(),p=value?.prepared,rows=value?.plan,head=value?.previousHead;
  if(!p||p.valid!==true||p.sourceSha!==captured?.context?.sha||!control.validSha(head)||
   !control.validSha(p.targetTree)||!Array.isArray(rows)||rows.length<3)fail();
  if(plan!==null&&(rows!==plan||p!==prepared||head!==previousHead))fail();
  const commit=rows.at(-1);
  if(commit.effect!=='create-commit'||commit.payload.tree!==p.targetTree||!isDeepStrictEqual(commit.payload.parents,[p.sourceSha,head]))fail();
  for(const row of rows){
   if(!['create-blob','create-tree','create-commit'].includes(row.effect))fail();
   const spec=bindProposalEffectRequest(captured.context.repository,rowInput(row));
   if(spec.key!==row.spec.key||spec.body!==row.spec.body)fail();
  }
  plan=rows;prepared=p;previousHead=head;
 };
 const preEffectValue=()=>{
  bindInput();const row=plan[index];if(!row)fail();
  return {count:index,headSha:previousHead,baseSha:prepared.sourceSha,treeSha:prepared.targetTree,
   receiptRef:digest({key:row.spec.key,body:row.spec.body}),authorized:false};
 };
 const freshCompletion=()=>{
  const executor=execution(),snapshot=executor.getSnapshot(),log=snapshot.commitLog;
  if(executor.getCommitCount()!==log.length)fail();
  const pre=log.findLastIndex(row=>row.stageId===ids.prefix+'-pre-effect');
  const previous=log.findLastIndex(row=>row.stageId===ids.prefix+'-apply'),expected=preEffectValue();
  if(pre<0||pre<=previous||!isDeepStrictEqual(log[pre].overwrite?.[ids.preEffect],expected)||
   !isDeepStrictEqual(snapshot.sharedState[ids.preEffect],expected))fail();
 };
 const verify=async(row,head)=>{
  const value=row.effect==='create-blob'?await objects.blob(row.payload):
   row.effect==='create-tree'?await objects.tree(prepared):
    head===null?null:await objects.commit(prepared,{sha:head});
  if(value===null)return false; // Unknown signed commit ID is never fabricated.
  if(!value.valid)fail();return true;
 };
 const chart=start.addFunction('Commit one exact current native object pre-effect iteration',scope=>{
  if(uncertain)fail();scope[ids.preEffect]=preEffectValue();
 },ids.prefix+'-pre-effect')
 .addDeciderFunction('Closed shared proposal object work remains',scope=>decide(scope,[
  {when:s=>s[ids.facts].count===index&&index<plan.length&&!uncertain,then:ids.prefix+'-apply',label:'Require this actual iteration and ALL fresh native predicates'}
 ],ids.prefix+'-blocked'),ids.prefix+'-effect-decision')
 .addFunctionBranch(ids.prefix+'-apply','Recheck complete native inputs before one exact object submission',async scope=>{
  freshCompletion();await recheck();freshCompletion();
  const row=plan[index],port=foottraceProposalEffectPort(captured.transport,rowInput(row));let reply,head=null;
  try{attempted++;reply=await port.submit();}
  catch{submission=port.observation().state;if(submission!=='uncertain')fail();uncertain=true;}
  submission=port.observation().state;
  if(submission==='returned'){
   const actual=own(own(reply,'data'),'sha');if(!control.validSha(actual)||(row.expected!==null&&actual!==row.expected))fail();head=actual;
  }else if(submission!=='uncertain')fail();
  verified=await verify(row,head);
  if(submission==='returned'){
   if(!verified)fail();acknowledged++;if(row.effect==='create-commit')preparedHead=head;index++;
  }
  scope[ids.facts]={count:index,executedWrites:attempted,verified,authorized:false,releaseReady:false};
 })
 .addFunctionBranch(ids.prefix+'-blocked','Invalid or stale iteration remains technical',fail).setDefault(ids.prefix+'-blocked').end()
 .addDeciderFunction('Every later object needs its OWN completed native pre-effect',scope=>decide(scope,[
  {when:s=>!uncertain&&s[ids.facts].count===index&&index<plan.length,then:ids.prefix+'-more',label:'Commit a new iteration before another mutation'}
 ],ids.prefix+'-stop'),ids.prefix+'-next-decision')
 .addFunctionBranch(ids.prefix+'-more','Prepare the next object iteration',()=>{}).loopTo(ids.prefix+'-pre-effect')
 .addFunctionBranch(ids.prefix+'-stop','Stop after preparation or ANY uncertainty',()=>{}).setDefault(ids.prefix+'-stop').end()
 .addFunction('Record object phase without a ref or continuation grant',scope=>{
  if(!uncertain&&(index!==plan.length||preparedHead===null))fail();
  scope[ids.result]={status:uncertain?'held':'complete',verified,count:acknowledged,executedWrites:attempted,
   ...(preparedHead===null?{}:{headSha:preparedHead}),authorized:false,releaseReady:false,refMoved:false,nextPhaseAdmitted:false};
 },ids.prefix+'-terminal');
 return Object.freeze({chart,resultStageId:ids.prefix+'-terminal',state:()=>({preparedHead,uncertain}),
  report:()=>({attempted,acknowledged,submission,verified,authorized:false,releaseReady:false,refMoved:false,nextPhaseAdmitted:false})});
}
