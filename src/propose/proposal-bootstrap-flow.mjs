import {decide,flowChart} from 'footprintjs';
import {captureFoottraceProposalInvocation,captureFoottraceMetadataWriterInvocation} from './proposal-invocation.mjs';
import {createFoottraceHostSourceReader} from './host-source-binding.mjs';
import {createFoottraceCurrentInputReader} from './foottrace-current-inputs.mjs';
import {createFoottraceProposerReader} from './current-proposer.mjs';
import {isDeepStrictEqual} from 'node:util';
/** Current trusted-CODE host observation prefix. This does not authenticate an
 * arbitrary runner or admit the still-missing reviewed thin production bridge.
 * Both CODE entries execute GET observations only. Inspection captures a read
 * owner; the private writer prefix captures the separate existing writer token.
 * Its backend owner is INPUT for the closed controller, never a permission.
 * Start-of-job key-holder identity stays cached, not fresh pre-effect authority.
 */
export function createFoottraceProposalBootstrapInspection(options={}){
 return createBootstrap(options,captureFoottraceProposalInvocation);
}
/** Internal CODE entry under the exact SC7 six-holder alternative. No key/JWT,
 * signing child or DATA constructor selector. Actual host/writer source review,
 * owning native pre-effect completion and ALL fresh repository rechecks remain
 * separately required before the closed controller may perform one PATCH.
 */
export function createFoottraceMetadataWriterBootstrap(options={}){
 return createBootstrap(options,captureFoottraceMetadataWriterInvocation);
}
function createBootstrap({env,host,fetcher,limits},captureInvocation){
 let captured=null,readHost=null,readInputs=null,readCurrent=null,initialReason='proposal-invocation-unavailable';
 try{
  captured=captureInvocation({env,fetcher,limits});initialReason='proposal-host-source-unavailable';
  readHost=createFoottraceHostSourceReader({...captured,host});
  readInputs=createFoottraceCurrentInputReader(captured);readCurrent=createFoottraceProposerReader(captured);
 }catch{/* Every invalid capture still sanitizes credential environment fields. */}
 let prepared=null,sourceBinding=null,current=null,backend=null,started=false;
 const resultStageId='proposal-bootstrap-result';
 const fresh=async()=>{
  if(prepared===null||sourceBinding===null||current===null)return false;
  const input=await readInputs();if(!input.valid||!isDeepStrictEqual(input.prepared,prepared))return false;
  const source=await readHost(prepared);if(!source.valid||source.digest!==sourceBinding.digest)return false;
  const identity=await readCurrent(prepared);return identity.valid&&identity.digest===current.digest;
 };
 const chart=flowChart('Capture trusted proposal entry inputs',scope=>{
  backend=null;
  if(started)throw new Error('proposal-bootstrap-already-executed');
  started=true;
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
  {when:s=>s.proposalBootstrapFacts.source,then:'proposal-bootstrap-read-current',label:'Join cached key-holder facts with live exact current running producer'}
 ],'proposal-bootstrap-hold-current'),'proposal-bootstrap-current-decision')
 .addFunctionBranch('proposal-bootstrap-read-current','Read live current producer with cached App facts',async scope=>{
  const value=await readCurrent(prepared);if(!value.valid)return;
  current=value;scope.proposalBootstrapRefs=[...scope.proposalBootstrapRefs,{kind:'current-proposer',receiptRef:value.digest}];
  scope.proposalBootstrapFacts={...scope.proposalBootstrapFacts,current:true,reason:'proposal-bootstrap-drift'};
 })
 .addFunctionBranch('proposal-bootstrap-hold-current','Current producer or cached App facts unavailable',()=>{}).setDefault('proposal-bootstrap-hold-current').end()
 .addDeciderFunction('Current native producer observed',scope=>decide(scope,[
  {when:s=>s.proposalBootstrapFacts.current,then:'proposal-bootstrap-recheck',label:'Reacquire local/native source and live current producer'}
 ],'proposal-bootstrap-hold-recheck'),'proposal-bootstrap-recheck-decision')
 .addFunctionBranch('proposal-bootstrap-recheck','Recheck host source and captured runtime identity',async scope=>{
  if(!await fresh())return;
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
 // This accessor exposes captured INPUT for another trusted native prefix,
 // never completion, host authority, writer permission or a saved grant.
 return Object.freeze({chart,resultStageId,getBackend:()=>backend,getInvocationInput:()=>captured,
  reobserve:async()=>{
   if(backend===null)return false;
   try{if(await fresh()&&backend!==null)return true;}catch{/* Unknown remains input drift. */}
   backend=null;return false;
  }});
}
