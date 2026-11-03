import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {flowChart,FlowChartExecutor,decide} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import control from '../guards/release-control.cjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceLineageObservationReader} from './foottrace-lineage.mjs';
import {createFoottracePendingObservationReader} from './foottrace-pending.mjs';
import {createFoottracePreparationProfile,createFoottraceRetainedAttemptProfile,createFoottracePendingWitnessProfile,createFoottraceWorkflowProfile} from './foottrace-profile.mjs';
import {createRetainedWorkflowReader} from './retained-workflows.mjs';
import {createFoottraceDiscoveryPorts} from './foottrace-discovery-ports.mjs';
import {createPendingWitnessDiscovery} from './pending-discovery.mjs';
import {createRefreshInputReader} from './refresh-inputs.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const discoveryReasons=new Set(['pending-discovery-unavailable','preparation-candidate-missing','preparation-candidate-ambiguous','pending-chain-hop-limit']);

/** One native chart bootstrap, extendable by the shared inspection recipe.
 * No caller supplies witnesses, lineage, native collections or saved grants.
 * Rich source/archive data remains backend-local. Only input knowledge is
 * produced; ordinary kind, current App/producer, writer and eligibility remain
 * separately required, even when a complete native record is available.
 */
export function createFoottraceInputBootstrap({transport,context}={}) {
 const profile=createFoottracePreparationProfile();let pinned,port,readLineage,readPending,readWorkflows,sources,discover;
 try{
  pinned=fields(jsonData(context),['repository','sha']);fields(pinned.repository,['id','full_name']);
  port=foottraceTransportPort(transport);
  if(!control.validSha(pinned.sha)||!control.sameRepo(port.repository,pinned.repository))throw new Error();
  readLineage=createFoottraceLineageObservationReader({transport:port,context:pinned,settings:port.settings});
  readPending=createFoottracePendingObservationReader({api:port.api,context:pinned,settings:{slug:port.settings.slug}});
  readWorkflows=createRetainedWorkflowReader({api:port.api,repository:port.repository,profile:createFoottraceWorkflowProfile()});
  sources=createFoottraceDiscoveryPorts({api:port.api,repository:port.repository});
  discover=createPendingWitnessDiscovery({profile,nativeProfile:createFoottracePendingWitnessProfile(),repository:port.repository,...sources});
 }catch{port=null;}
 let lineage=null,pending=null,collection=null,discovery=null,inputs=null,prepared=null,complete=false;
 const chart=flowChart('Discover actual published predecessor',async scope=>{
  scope.proposeBootstrapFacts={lineage:false,pending:false,workflows:false,discovery:false,prepared:false,fresh:false,reason:'bootstrap-context-unavailable',
   authorized:false,executedWrites:0,privateAppIdentityAdmitted:false};
  scope.proposeBootstrapRefs=[];
  if(!port)return;
  try{
   const value=await readLineage();
   if(!value.valid||value.scope!=='published-lineage-only'||value.sourceSha!==pinned.sha||value.authorized!==false)throw new Error();
   lineage=value;
   scope.proposeBootstrapRefs=[{kind:'published-lineage',receiptRef:digest({predecessor:lineage.predecessor,sourceSha:lineage.sourceSha,
    sourceTree:lineage.sourceTree,version:lineage.version,archiveDigest:lineage.archiveDigest})}];
   scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,lineage:true,reason:'bootstrap-pending-unavailable'};
  }catch{scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,reason:'bootstrap-lineage-unavailable'};}
 },'propose-bootstrap-lineage')
 .addDeciderFunction('Published predecessor discovered',scope=>decide(scope,[
  {when:s=>s.proposeBootstrapFacts.lineage===true,then:'bootstrap-read-pending',label:'Actual native published L only'}],'bootstrap-hold-pending'),'propose-bootstrap-lineage-decision')
 .addFunctionBranch('bootstrap-read-pending','Discover actual pending reference',async scope=>{
  try{
   const value=await readPending();
   if(!value.valid||value.scope!=='pending-reference-only'||value.reference.source!==pinned.sha||value.authorized!==false||
    value.reference.head===lineage.predecessor.head||value.reference.head===lineage.predecessor.merge)throw new Error();
   pending=value;scope.proposeBootstrapRefs=[...scope.proposeBootstrapRefs,{kind:'pending-reference',receiptRef:digest(value.reference)}];
   scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,pending:true,reason:'bootstrap-workflows-unavailable'};
  }catch{/* Preserve the finite pending hold. */}
 })
 .addFunctionBranch('bootstrap-hold-pending','Pending discovery blocked',()=>{}).setDefault('bootstrap-hold-pending').end()
 .addDeciderFunction('Pending reference discovered',scope=>decide(scope,[
  {when:s=>s.proposeBootstrapFacts.pending===true,then:'bootstrap-read-workflows',label:'Discover complete retained native observations'}],'bootstrap-hold-workflows'),'propose-bootstrap-pending-decision')
 .addFunctionBranch('bootstrap-read-workflows','Read retained workflow collection',async scope=>{
  try{
   const value=await readWorkflows();if(!value.valid)throw new Error();
   collection=value;scope.proposeBootstrapRefs=[...scope.proposeBootstrapRefs,{kind:'retained-workflows',receiptRef:value.digest,count:value.attempts.length}];
   scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,workflows:true,reason:'pending-discovery-unavailable'};
  }catch{/* Preserve the workflow hold. */}
 })
 .addFunctionBranch('bootstrap-hold-workflows','Workflow discovery blocked',()=>{}).setDefault('bootstrap-hold-workflows').end()
 .addDeciderFunction('Complete retained collection read',scope=>decide(scope,[
  {when:s=>s.proposeBootstrapFacts.workflows===true,then:'bootstrap-discover-inputs',label:'Find unique original preparation cohorts'}],'bootstrap-hold-inputs'),'propose-bootstrap-workflow-decision')
 .addFunctionBranch('bootstrap-discover-inputs','Discover actual preparation chain',async scope=>{
  try{
   const value=await discover({pending,lineage,collection});
   if(!value.valid){scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,reason:discoveryReasons.has(value.reason)?value.reason:'pending-discovery-unavailable'};return;}
   discovery=value;scope.proposeBootstrapRefs=[...scope.proposeBootstrapRefs,{kind:'preparation-discovery',receiptRef:value.digest,count:value.references.length}];
   scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,discovery:true,reason:'bootstrap-preparation-unavailable'};
  }catch{/* Preserve the discovery hold. */}
 })
 .addFunctionBranch('bootstrap-hold-inputs','Preparation chain discovery blocked',()=>{}).setDefault('bootstrap-hold-inputs').end()
 .addDeciderFunction('Unique native chain reconstructed',scope=>decide(scope,[
  {when:s=>s.proposeBootstrapFacts.discovery===true,then:'bootstrap-prepare-current',label:'Reconstruct current M from actual raw queue'}],'bootstrap-hold-current'),'propose-bootstrap-discovery-decision')
 .addFunctionBranch('bootstrap-prepare-current','Reconstruct current ordinary input closure',async scope=>{
  try{
   inputs={pending:discovery.backend.pending,currentSource:await sources.readSource(pinned.sha),currentPreparationDate:null};
   const value=createRefreshInputReader(profile)(inputs);
   if(!value.valid||value.sourceSha!==pinned.sha||value.sourceTree!==lineage.sourceTree||value.fromVersion!==lineage.version||
    value.pendingSha!==pending.reference.head||value.pendingTree!==pending.reference.tree||!isDeepStrictEqual(value.predecessor,lineage.predecessor))throw new Error();
   prepared=value;scope.proposeBootstrapRefs=[...scope.proposeBootstrapRefs,{kind:'current-preparation',receiptRef:digest({sourceSha:value.sourceSha,
    sourceTree:value.sourceTree,pendingSha:value.pendingSha,pendingTree:value.pendingTree,targetTree:value.targetTree,version:value.version})}];
   scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,prepared:true,reason:'bootstrap-observation-drift'};
  }catch{inputs=prepared=null;}
 })
 .addFunctionBranch('bootstrap-hold-current','Current reconstruction blocked',()=>{}).setDefault('bootstrap-hold-current').end()
 .addDeciderFunction('Current input closure reconstructed',scope=>decide(scope,[
  {when:s=>s.proposeBootstrapFacts.prepared===true,then:'bootstrap-recheck-inputs',label:'Reobserve pending reference and complete workflow collection'}],'bootstrap-hold-fresh'),'propose-bootstrap-preparation-decision')
 .addFunctionBranch('bootstrap-recheck-inputs','Recheck native discovery inputs',async scope=>{
  try{
   const freshPending=await readPending();
   if(!freshPending.valid||!isDeepStrictEqual(freshPending.reference,pending.reference))throw new Error();
   const freshCollection=await readWorkflows();
   if(!freshCollection.valid||freshCollection.digest!==collection.digest)throw new Error();
   complete=true;scope.proposeBootstrapFacts={...scope.proposeBootstrapFacts,fresh:true,reason:'bootstrap-inputs-bound'};
  }catch{/* Adjacent snapshots do not imply global continuity or authority. */}
 })
 .addFunctionBranch('bootstrap-hold-fresh','Fresh discovery observation blocked',()=>{}).setDefault('bootstrap-hold-fresh').end()
 .addFunction('Record native bootstrap facts',scope=>{
  scope.proposeBootstrapResult={...scope.proposeBootstrapFacts,available:scope.proposeBootstrapFacts.fresh===true,
   count:scope.proposeBootstrapRefs.length,receiptRef:digest(scope.proposeBootstrapRefs)};
 },'propose-bootstrap-result');
 return {chart,profile,getBackend:()=>complete?{inputs,prepared,lineage,pending,collection,discovery}:null};
}

export async function runFoottraceInputBootstrap({recordLimitBytes,...options}={}) {
 const stage=createFoottraceInputBootstrap(options),chart=stage.chart.build();
 const executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));let completed=false;
 try{await executor.run();completed=true;}catch{/* An incomplete native run cannot supply prepared backend data. */}
 const snapshot=completed?executor.getSnapshot():undefined;
 const record=captureRecord({snapshot,structure:chart.buildTimeStructure,completed,recordLimitBytes,reason:'NATIVE_FAILURE'});
 const result=snapshot?.sharedState?.proposeBootstrapResult,available=result?.available===true;
 return {status:!record.complete?'incomplete':available?'bootstrap-inputs-only':'held',record,
  report:{authorized:false,executedWrites:0,privateAppIdentityAdmitted:false,reason:result?.reason??'bootstrap-unavailable',
   ...(available?{receiptRef:result.receiptRef}:{} )},
  backend:record.complete&&available?stage.getBackend():null};
}
