import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {createFoottraceMetadataWriterBootstrap} from './proposal-bootstrap-flow.mjs';
import {appendFoottraceMetadataReconciliation} from './metadata-c1-flow.mjs';
import {own} from './source-inventory.mjs';
import {createProposalOutcomeOutput} from './proposal-outcome-output.mjs';
const fail=()=>{throw new Error('metadata-c1-unavailable');};
/** Internal same-owner C1 controller. No public facade/workflow adoption yet.
 * Start-of-job App identity stays start identity. All current repository facts
 * are reacquired through the captured writer owner; no private-App port, saved
 * grant, supplied executor, historical creator, ref refresh or publication.
 * Production effects require the separately reviewed physical writer caller.
 */
export function runFoottraceMetadataReconciliation(options={}){
 return runCore(options,null);
}
/** CODE-selected local output composition; DATA fields cannot promote the
 * no-output entry. Production caller/path/workflow adoption is still separate.
 */
export function runFoottraceMetadataReconciliationWithOutput(options={}){
 return runCore(options,createProposalOutcomeOutput);
}
async function runCore(options,outputFactory){
 const {env,host,fetcher,limits,recordLimitBytes}=options;
 const root=createFoottraceMetadataWriterBootstrap({env,host,fetcher,limits});
 // Capture erases credentials before reading CODE IO ports or any provider await.
 let outputWriter=null;
 const outputFacts={requested:outputFactory!==null,attempted:false,saved:false,partialSavePossible:false};
 if(outputFactory!==null)try{
  outputWriter=outputFactory({appendSummary:own(options,'appendSummary'),appendOutput:own(options,'appendOutput')});
 }catch{/* Invalid ports must refuse before the provider effect branch. */}
 const captured=root.getInvocationInput();let executor;
 const completed=id=>{
  const snapshot=executor.getSnapshot(),log=snapshot.commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 let start=root.chart;
 if(outputFactory!==null)start=start.addFunction('Require the existing CODE output ports',()=>{
  if(outputWriter===null)fail();
 },'metadata-c1-output-port-boundary');
 const stage=appendFoottraceMetadataReconciliation({chart:start,captured,root,completed});
 let chart=stage.chart;
 if(outputFactory!==null)chart=chart.addFunction('Persist fixed named outcome after the actual native C1 terminal',async scope=>{
  const terminal=scope.metadataC1Result;
  if(!completed('metadata-c1-terminal')||stage.outcome()===null||outputWriter===null||terminal?.verified!==true||
   terminal.status!==(stage.outcome()==='metadata-match'?'match':'held'))fail();
  outputFacts.attempted=true;scope.metadataC1OutputFacts={...outputFacts};
  try{await outputWriter.write(stage.outcome());outputFacts.saved=true;}
  catch{outputFacts.partialSavePossible=true;scope.metadataC1OutputFacts={...outputFacts};fail();}
  scope.metadataC1OutputFacts={...outputFacts};
 },'metadata-c1-output');
 const built=chart.build();
 executor=new FlowChartExecutor(built,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));
 let complete=false;
 try{await executor.run();complete=completed('metadata-c1-terminal')&&(outputFactory===null||completed('metadata-c1-output'));}catch{/* Fixed technical outcome; no successful business-HOLD conversion. */}
 // Ordinary native partial records are DIAGNOSTICS, never continuation input.
 const diagnostic=captureRecord({snapshot:executor.getSnapshot(),structure:built.buildTimeStructure,completed:true,recordLimitBytes});
 const record=complete?diagnostic:{...diagnostic,complete:false,reason:'NATIVE_FAILURE'};
 const status=record.complete&&stage.outcome()!==null?stage.outcome():'technical-failure';
 return {status,record,report:{...stage.report(),output:{...outputFacts},releaseReady:false,authorized:false,
  appIdentityObservation:root.getBackend()!==null?'start-of-job-key-holder-facts':'unavailable',privateAppIdentityAdmitted:false,
  writerCredentialBindingAdmitted:false,
  proposeOutcome:status==='metadata-hold'?'hold-metadata-stale':status==='metadata-match'?'metadata-matched':'technical-failure'}};
}
