import {flowChart,FlowChartExecutor,decide} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {own} from './source-inventory.mjs';
import {createProposalOutcomeOutput} from './proposal-outcome-output.mjs';
import {proposalOutcomeText} from './proposal-outcome-text.mjs';
import {wholeProposalTerminalOutcome} from './proposal-terminal-outcome.mjs';
import {createFoottraceMetadataWriterBootstrap} from './proposal-bootstrap-flow.mjs';
import {createFoottraceProposalRouteReader} from './proposal-route-observation.mjs';
import {appendFoottraceRolloverPreparation} from './rollover-successor-flow.mjs';
import {appendFoottraceRolloverProposal} from './rollover-proposal-flow.mjs';
import {appendFoottraceMetadataReconciliation} from './metadata-c1-flow.mjs';
import {appendFoottracePendingSuccessor} from './pending-successor-flow.mjs';
import {appendFoottracePendingRefresh} from './pending-refresh-flow.mjs';
const fail=()=>{throw new Error('proposal-route-unavailable');};
const decisionId='proposal-route-decision';
/** Static CODE wiring of the public native FlowChart graph shape. This changes
 * construction only: the native executor/decide()/root commit log still own ALL
 * execution. Native isolated subflows expose no active child commit log, so
 * they cannot supply this route's immediate pre-effect proof. No parallel
 * journal, copied interpreter, custom causal graph or DATA graph is accepted.
 */
function attachRoute(chart,id,route){
 const locate=root=>{
  let node=root;
  for(let n=0;node&&n<512;n++,node=node.next)if(node.id===decisionId)return node;
  fail();
 };
 const node=locate(chart.root).children.find(x=>x.id===id),spec=locate(chart.buildTimeStructure).children.find(x=>x.id===id);
 if(!node||!spec||node.next||spec.next||Object.keys(route.subflows??{}).length)fail();
 for(const key of route.stageMap.keys())if(chart.stageMap.has(key))fail();
 for(const key of route.stageDescriptions.keys())if(chart.stageDescriptions.has(key))fail();
 node.next=route.root;spec.next=route.buildTimeStructure;
 for(const [key,value] of route.stageMap)chart.stageMap.set(key,value);
 for(const [key,value] of route.stageDescriptions)chart.stageDescriptions.set(key,value);
}
/** Private whole native entry. Exactly ONE capture/root/executor selects SAME
 * C1, pending REF or ordinary rollover builders. No selector DATA, nested run,
 * saved grant, alternate-route retry or production adoption is introduced.
 */
export function runFoottraceProposal(options={}){return runCore(options,null);}
/** Fixed CODE output composition. DATA cannot select the factory or supply a
 * terminal, executor or authority. Physical writer/output adoption is separate.
 */
export function runFoottraceProposalWithOutput(options={}){return runCore(options,createProposalOutcomeOutput);}
async function runCore(options,outputFactory){
 const {env,host,fetcher,limits,recordLimitBytes}=options;
 const root=createFoottraceMetadataWriterBootstrap({env,host,fetcher,limits}),captured=root.getInvocationInput();
 // Capture sanitizes credentials before any CODE output-port read/provider await.
 let outputWriter=null,outcome=null;
 const outputFacts={requested:outputFactory!==null,attempted:false,saved:false,partialSavePossible:false};
 if(outputFactory!==null)try{outputWriter=outputFactory({appendSummary:own(options,'appendSummary'),appendOutput:own(options,'appendOutput')});}catch{/* Refuse before effects. */}
 let executor,readRoute=null,kind=null;
 const completed=id=>{
  const log=executor.getSnapshot().commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 try{
  readRoute=createFoottraceProposalRouteReader(captured);
 }catch{/* Invalid capture cannot select an effect recipe. */}
 const metadata=appendFoottraceMetadataReconciliation({chart:flowChart('Enter current metadata route',()=>{},'existing-metadata-entry'),
  captured,root,completed});
 const refresh=appendFoottracePendingSuccessor({chart:flowChart('Enter pending refresh route',()=>{},'existing-refresh-entry'),
  captured,root,completed,execution:()=>executor,continuation:appendFoottracePendingRefresh});
 const ordinary=appendFoottraceRolloverPreparation({chart:flowChart('Enter ordinary rollover route',()=>{},'proposal-ordinary-entry'),
  captured,root,completed,execution:()=>executor,continuation:appendFoottraceRolloverProposal});
 const selected=()=>kind==='metadata-only'?metadata:kind==='ref-refresh'?refresh:kind==='ordinary'?ordinary:null;
 let start=root.chart;
 if(outputFactory!==null)start=start.addFunction('Require trusted CODE local output ports before any mutation',()=>{
  if(outputWriter===null)fail();
 },'proposal-route-output-boundary');
 let chart=start.addFunction('Observe actual complete PR/ref windows for selection only',async scope=>{
  if(!completed(root.resultStageId)||root.getBackend()===null||readRoute===null)fail();
  const observed=await readRoute(root.getBackend().prepared);if(!observed.valid||!await root.reobserve())fail();
  kind=observed.kind;
  scope.proposalRouteFacts={route:kind,headSha:observed.reference.head,receiptRef:observed.digest,authorized:false,releaseReady:false};
 },'proposal-route-inputs')
 .addDeciderFunction('Choose ONE native proposal recipe from actual selector INPUT',scope=>decide(scope,[
  {when:s=>kind==='metadata-only'&&s.proposalRouteFacts.route===kind,then:'proposal-route-metadata',label:'SAME standalone C1, including its own required checks'},
  {when:s=>kind==='ref-refresh'&&s.proposalRouteFacts.route===kind,then:'proposal-route-refresh',label:'SAME eight-hop pending refresh; no fallback'},
  {when:s=>kind==='ordinary'&&s.proposalRouteFacts.route===kind,then:'proposal-route-ordinary',label:'Zero-open INPUT only; complete native published-L eligibility is mandatory in the ordinary builder'}
 ],'proposal-route-unavailable'),decisionId)
 .addFunctionBranch('proposal-route-metadata','Current same-target metadata recipe',()=>{})
 .addFunctionBranch('proposal-route-refresh','Current changed-target ref recipe',()=>{})
 .addFunctionBranch('proposal-route-ordinary','Current ordinary native rollover recipe',()=>{})
 .addFunctionBranch('proposal-route-unavailable','No authoritative branch available',fail).setDefault('proposal-route-unavailable').end()
 .addFunction('Record only the selected actual native terminal',scope=>{
  const stage=selected();if(stage===null||!completed(stage.resultStageId))fail();
  const status=kind==='metadata-only'?metadata.outcome():stage.status();
  const source=kind==='metadata-only'?scope.metadataC1Result:kind==='ref-refresh'?scope.pendingRefreshResult:scope.rolloverPrResult;
  outcome=wholeProposalTerminalOutcome(kind,status,source);
  scope.proposalRouteResult={route:kind,status,outcome,authorized:false,releaseReady:false};
 },'proposal-route-terminal');
 if(outputFactory!==null)chart=chart.addFunction('Persist fixed named output after actual selected and whole native terminals',async scope=>{
  const terminal=scope.proposalRouteResult,stage=selected(),status=stage===null?null:kind==='metadata-only'?metadata.outcome():stage.status();
  if(!completed('proposal-route-terminal')||stage===null||!completed(stage.resultStageId)||outputWriter===null||outcome===null||
   terminal?.route!==kind||terminal.status!==status||terminal.outcome!==outcome||outcome!==wholeProposalTerminalOutcome(kind,status,
    kind==='metadata-only'?scope.metadataC1Result:kind==='ref-refresh'?scope.pendingRefreshResult:scope.rolloverPrResult))fail();
  outputFacts.attempted=true;scope.proposalRouteOutputFacts={...outputFacts};
  try{await outputWriter.write(outcome);outputFacts.saved=true;}
  catch{outputFacts.partialSavePossible=true;scope.proposalRouteOutputFacts={...outputFacts};fail();}
  scope.proposalRouteOutputFacts={...outputFacts};
 },'proposal-route-output');
 chart=chart.build();
 attachRoute(chart,'proposal-route-metadata',metadata.chart.build());
 attachRoute(chart,'proposal-route-refresh',refresh.chart.build());
 attachRoute(chart,'proposal-route-ordinary',ordinary.chart.build());
 executor=new FlowChartExecutor(chart,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let complete=false;
 try{await executor.run();complete=completed('proposal-route-terminal')&&(outputFactory===null||completed('proposal-route-output'));}catch{/* No raw private error or alternate-route retry. */}
 const diagnostic=captureRecord({snapshot:executor.getSnapshot(),structure:chart.buildTimeStructure,completed:true,recordLimitBytes});
 const record=complete?diagnostic:{...diagnostic,complete:false,reason:'NATIVE_FAILURE'},stage=selected();
 const status=record.complete?(kind==='metadata-only'?metadata.outcome():stage.status()):'technical-failure';
 return {status,record,
  report:{...(stage===null?{}:stage.report()),route:kind??'unavailable',output:{...outputFacts},
   proposeOutcome:status==='technical-failure'||outcome===null?'technical-failure':proposalOutcomeText(outcome).name,
   authorized:false,releaseReady:false,wholeNativeEntryImplemented:true,productionAdopted:false,wholeProposeImplemented:false}};
}
