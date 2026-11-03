import {decide,flowChart} from 'footprintjs';
import {captureFoottraceProposalInvocation} from './proposal-invocation.mjs';
import {createFoottraceHostSourceReader} from './host-source-binding.mjs';
import {createFoottraceCurrentInputReader} from './foottrace-current-inputs.mjs';
import {createFoottraceProposerReader} from './current-proposer.mjs';
import {runNativeObservationRecord} from './native-observation-record.mjs';
/** Current trusted-CODE host observation prefix. This does not authenticate an
 * arbitrary runner or admit the still-missing reviewed thin production bridge.
 * The captured client remains GET-only; no writer facet or effects are exposed.
 */
export async function runFoottraceProposalBootstrapInspection({env,host,fetcher,limits,recordLimitBytes}={}){
 let captured=null,readHost=null,readInputs=null,readCurrent=null,initialReason='proposal-invocation-unavailable';
 try{
  captured=captureFoottraceProposalInvocation({env,fetcher,limits});initialReason='proposal-host-source-unavailable';
  readHost=createFoottraceHostSourceReader({...captured,host});
  readInputs=createFoottraceCurrentInputReader(captured);readCurrent=createFoottraceProposerReader(captured);
 }catch{/* Every invalid capture still sanitizes credential environment fields. */}
 let prepared=null,sourceBinding=null,current=null,backend=null;
 const chart=flowChart('Capture trusted proposal entry inputs',scope=>{
  scope.proposalBootstrapFacts={captured:captured!==null&&readHost!==null,inputs:false,source:false,current:false,fresh:false,
   authorized:false,executedWrites:0,writerCredentialBindingAdmitted:false,reason:initialReason};
  scope.proposalBootstrapRefs=[];
 },'proposal-bootstrap-capture')
 .addDeciderFunction('Captured environment and CODE host available',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.captured,then:'proposal-bootstrap-read-inputs',label:'Independently reconstruct actual current source'}
 ],'proposal-bootstrap-hold-inputs'),'proposal-bootstrap-input-decision')
 .addFunctionBranch('proposal-bootstrap-read-inputs','Read actual current ordinary preparation',async scope=>{
  try{
   const value=await readInputs();if(!value.valid)throw new Error();
   prepared=value.prepared;scope.proposalBootstrapRefs=[{kind:'current-inputs',receiptRef:value.digest}];
   scope.proposalBootstrapFacts={...scope.proposalBootstrapFacts,inputs:true,reason:'proposal-host-source-unavailable'};
  }catch{/* No saved preparation fallback. */}
 })
 .addFunctionBranch('proposal-bootstrap-hold-inputs','Current source unavailable',()=>{}).setDefault('proposal-bootstrap-hold-inputs').end()
 .addDeciderFunction('Actual current source available',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.inputs,then:'proposal-bootstrap-read-host',label:'Bind reviewed CODE profile/entry and native immutable source bytes'}
 ],'proposal-bootstrap-hold-host'),'proposal-bootstrap-host-decision')
 .addFunctionBranch('proposal-bootstrap-read-host','Read exact host workflow and entry source',async scope=>{
  const value=await readHost(prepared);if(!value.valid)return;
  sourceBinding=value;scope.proposalBootstrapRefs=[...scope.proposalBootstrapRefs,{kind:'host-source',receiptRef:value.digest}];
  scope.proposalBootstrapFacts={...scope.proposalBootstrapFacts,source:true,reason:'current-proposer-unavailable'};
 })
 .addFunctionBranch('proposal-bootstrap-hold-host','CODE host source unavailable',()=>{}).setDefault('proposal-bootstrap-hold-host').end()
 .addDeciderFunction('Host source bytes joined',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.source,then:'proposal-bootstrap-read-current',label:'Read private configured App and exact current running producer using same captured owner'}
 ],'proposal-bootstrap-hold-current'),'proposal-bootstrap-current-decision')
 .addFunctionBranch('proposal-bootstrap-read-current','Read actual current private identity',async scope=>{
  const value=await readCurrent(prepared);if(!value.valid)return;
  current=value;scope.proposalBootstrapRefs=[...scope.proposalBootstrapRefs,{kind:'current-proposer',receiptRef:value.digest}];
  scope.proposalBootstrapFacts={...scope.proposalBootstrapFacts,current:true,reason:'proposal-bootstrap-drift'};
 })
 .addFunctionBranch('proposal-bootstrap-hold-current','Current private identity unavailable',()=>{}).setDefault('proposal-bootstrap-hold-current').end()
 .addDeciderFunction('Current private producer observed',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.current,then:'proposal-bootstrap-recheck',label:'Reacquire local/native source and private current identity'}
 ],'proposal-bootstrap-hold-recheck'),'proposal-bootstrap-recheck-decision')
 .addFunctionBranch('proposal-bootstrap-recheck','Recheck host source and captured runtime identity',async scope=>{
  const source=await readHost(prepared);if(!source.valid||source.digest!==sourceBinding.digest)return;
  const identity=await readCurrent(prepared);if(!identity.valid||identity.digest!==current.digest)return;
  scope.proposalBootstrapFacts={...scope.proposalBootstrapFacts,fresh:true,reason:'proposal-bootstrap-observed'};
 })
 .addFunctionBranch('proposal-bootstrap-hold-recheck','Fresh source/client observations unavailable',()=>{}).setDefault('proposal-bootstrap-hold-recheck').end()
 .addDeciderFunction('Proposal bootstrap observation complete',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.captured&&s.proposalBootstrapFacts.inputs&&s.proposalBootstrapFacts.source&&s.proposalBootstrapFacts.current&&s.proposalBootstrapFacts.fresh,
   then:'proposal-bootstrap-known',label:'Input/root continuity observation only; actual bridge/writer admission remains separate'}
 ],'proposal-bootstrap-held'),'proposal-bootstrap-final-decision')
 .addFunctionBranch('proposal-bootstrap-known','Captured runtime source observations known',()=>{
  backend=Object.freeze({...captured,prepared,sourceBinding,current});
 })
 .addFunctionBranch('proposal-bootstrap-held','Proposal runtime observations held',()=>{}).setDefault('proposal-bootstrap-held').end()
 .addFunction('Record proposal bootstrap observation',scope=>{
  scope.proposalBootstrapResult={...scope.proposalBootstrapFacts,count:scope.proposalBootstrapRefs.length};
 },'proposal-bootstrap-result');
 const {record,snapshot}=await runNativeObservationRecord({chart,recordLimitBytes});
 const known=record.complete&&backend!==null;
 return {status:!record.complete?'incomplete':known?'proposal-bootstrap-only':'held',record,
  report:{authorized:false,executedWrites:0,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,
   reason:snapshot?.sharedState?.proposalBootstrapResult?.reason??'proposal-bootstrap-unavailable'},
  backend:known?backend:null};
}
