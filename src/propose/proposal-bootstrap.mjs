import {createFoottraceProposalBootstrapInspection} from './proposal-bootstrap-flow.mjs';
import {runNativeObservationRecord} from './native-observation-record.mjs';
/** Complete read-only facade. The source factory is internal CODE; the compiled
 * program exports only this facade. Incomplete capture discards private inputs.
 */
export async function runFoottraceProposalBootstrapInspection({recordLimitBytes,...options}={}){
 const stage=createFoottraceProposalBootstrapInspection(options);
 const {record,snapshot}=await runNativeObservationRecord({chart:stage.chart,recordLimitBytes});
 const backend=stage.getBackend(),known=record.complete&&backend!==null;
 return {status:!record.complete?'incomplete':known?'proposal-bootstrap-only':'held',record,
  report:{authorized:false,executedWrites:0,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,
   reason:snapshot?.sharedState?.proposalBootstrapResult?.reason??'proposal-bootstrap-unavailable'},
  backend:known?backend:null};
}
