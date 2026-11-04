import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {createFoottraceMetadataWriterBootstrap} from './proposal-bootstrap-flow.mjs';
import {appendFoottraceRolloverPreparation} from './rollover-successor-flow.mjs';
import {appendFoottraceRolloverProposal} from './rollover-proposal-flow.mjs';
import {appendFoottraceRolloverRef} from './rollover-ref-flow.mjs';
/** Private ordinary fixed CODE entries. Public DATA cannot supply a root,
 * executor, completion/eligibility claim, writer selector or continuation.
 * Actual response state stays on its owner; production adoption and whole-route dispatch remain separate.
 */
export function runFoottraceRolloverPreparation(options={}){return runCore(options,null);}
export function runFoottraceRolloverRef(options={}){return runCore(options,appendFoottraceRolloverRef);}
export function runFoottraceRolloverProposal(options={}){return runCore(options,appendFoottraceRolloverProposal);}
async function runCore({env,host,fetcher,limits,recordLimitBytes},continuation){
 const root=createFoottraceMetadataWriterBootstrap({env,host,fetcher,limits}),captured=root.getInvocationInput();
 let executor;
 const completed=id=>{
  const log=executor.getSnapshot().commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 const stage=appendFoottraceRolloverPreparation({chart:root.chart,captured,root,completed,execution:()=>executor,continuation});
 const chart=stage.chart.build();
 executor=new FlowChartExecutor(chart,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let complete=false;
 try{await executor.run();complete=completed(stage.resultStageId);}catch{/* Technical failure is never a business HOLD or retry. */}
 const diagnostic=captureRecord({snapshot:executor.getSnapshot(),structure:chart.buildTimeStructure,completed:true,recordLimitBytes});
 const record=complete?diagnostic:{...diagnostic,complete:false,reason:'NATIVE_FAILURE'};
 return {status:record.complete?stage.status():'technical-failure',record,report:stage.report()};
}
