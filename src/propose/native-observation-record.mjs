import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
/** One native executor/record for a composed observation chart. Record completion
 * is diagnostic; it admits no provider history, writer permission or effect. */
export async function runNativeObservationRecord({chart:builder,recordLimitBytes}) {
 const chart=builder.build();
 const executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let completed=false;
 try{await executor.run();completed=true;}catch{/* Private provider errors stay outside records. */}
 const snapshot=completed?executor.getSnapshot():undefined;
 const record=captureRecord({snapshot,structure:chart.buildTimeStructure,completed,recordLimitBytes,reason:'NATIVE_FAILURE'});
 return {record,snapshot};
}
