import {isDeepStrictEqual} from 'node:util';
import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {createFoottraceProposalBootstrapInspection} from './proposal-bootstrap-flow.mjs';
import {createFoottraceMetadataHistoryInspection} from './foottrace-metadata-history.mjs';
/** Production INPUT composition: capture one opaque runtime owner, observe its
 * actual local/native host source and live running producer with cached App facts, then reuse
 * that SAME owner for current preparation/retained history. One executor owns
 * both prefixes and observes its own actual native completed result stages.
 * Matching diagnostic inputs admit no writer, terminal result or live effect.
 */
export async function runFoottraceMetadataBootstrapInspection({env,host,fetcher,limits,recordLimitBytes}={}){
 const root=createFoottraceProposalBootstrapInspection({env,host,fetcher,limits});
 const captured=root.getInvocationInput();let executor,backend=null;
 const completed=id=>{
  const snapshot=executor.getSnapshot(),log=snapshot.commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 const predecessor=root.chart.addFunction('Require completed native source and identity input prefix',scope=>{
  if(root.getBackend()===null||!completed(root.resultStageId))
   throw new Error('metadata-bootstrap-root-unavailable');
  scope.metadataBootstrapRoot={observed:true,authorized:false,executedWrites:0};
 },'metadata-bootstrap-root-boundary');
 const history=createFoottraceMetadataHistoryInspection(captured??{},predecessor);
 const chart=history.chart.addFunction('Reobserve captured host and current identity after native history',async scope=>{
  scope.metadataBootstrapFacts={known:false,fresh:false,authorized:false,executedWrites:0,
   writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,reason:'metadata-bootstrap-history-unavailable'};
  if(!completed(history.resultStageId))throw new Error('metadata-bootstrap-history-incomplete');
  const initial=root.getBackend(),observed=history.getBackend();
  if(initial===null||observed===null)return;
  if(!isDeepStrictEqual(initial.prepared,observed.prepared)||initial.current.digest!==observed.current.digest)return;
  scope.metadataBootstrapFacts={...scope.metadataBootstrapFacts,reason:'metadata-bootstrap-root-drift'};
  if(!await root.reobserve())return;
  backend=Object.freeze({...initial,history:observed});
  scope.metadataBootstrapFacts={...scope.metadataBootstrapFacts,known:true,fresh:true,reason:'metadata-bootstrap-observed'};
 },'metadata-bootstrap-current-recheck').build();
 executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let completedRun=false;
 try{await executor.run();completedRun=true;}catch{/* Finite failure; never a terminal business-HOLD or success conversion. */}
 const snapshot=completedRun?executor.getSnapshot():undefined;
 const record=captureRecord({snapshot,structure:chart.buildTimeStructure,completed:completedRun,recordLimitBytes,reason:'NATIVE_FAILURE'});
 const facts=snapshot?.sharedState?.metadataBootstrapFacts,known=record.complete&&facts?.known===true&&backend!==null;
 return {status:!record.complete?'incomplete':known?'metadata-bootstrap-only':'held',record,
  report:{authorized:false,executedWrites:0,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,
   sameCapturedInputOwner:known,reason:facts?.reason??'metadata-bootstrap-unavailable'},backend:known?backend:null};
}
