import {appendFoottracePendingRefresh} from './pending-refresh-flow.mjs';
import {appendFoottracePendingSuccessor} from './pending-successor-flow.mjs';
import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {createFoottraceMetadataWriterBootstrap} from './proposal-bootstrap-flow.mjs';
/** Private CODE-selected entries. One native owner/recipe is appended to its
 * existing chart; no DATA continuation, second capture or nested executor.
 * Whole-route dispatch and production caller adoption remain separate.
 */
export function runFoottracePendingSuccessorPreparation(options={}){return runCore(options,null);}
export function runFoottracePendingRefresh(options={}){return runCore(options,appendFoottracePendingRefresh);}
async function runCore(options,continuation){
 const {env,host,fetcher,limits,recordLimitBytes}=options;
 const root=createFoottraceMetadataWriterBootstrap({env,host,fetcher,limits}),captured=root.getInvocationInput();
 let executor;
 const completed=id=>{
  const log=executor.getSnapshot().commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 const stage=appendFoottracePendingSuccessor({chart:root.chart,captured,root,completed,execution:()=>executor,continuation});
 const built=stage.chart.build();
 executor=new FlowChartExecutor(built,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let complete=false;
 try{await executor.run();complete=completed('pending-successor-terminal')&&completed(stage.resultStageId);}catch{/* No raw error, successful business HOLD or submission retry. */}
 const diagnostic=captureRecord({snapshot:executor.getSnapshot(),structure:built.buildTimeStructure,completed:true,recordLimitBytes});
 const record=complete?diagnostic:{...diagnostic,complete:false,reason:'NATIVE_FAILURE'};
 return {status:record.complete?stage.status():'technical-failure',record,report:stage.report()};
}
