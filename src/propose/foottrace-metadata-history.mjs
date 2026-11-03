import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {flowChart,decide} from 'footprintjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceWorkflowProfile,createFoottraceRetainedAttemptProfile} from './foottrace-profile.mjs';
import {createFoottraceMetadataInputBootstrap} from './foottrace-metadata-inputs.mjs';
import {createObservedAppCommitInspection} from './observed-commit-flow.mjs';
import {createRetainedWorkflowReader} from './retained-workflows.mjs';
import {createRetainedSourceVersionReader} from './retained-source-versions.mjs';
import {createFoottraceCandidatePublicationReader} from './candidate-publication.mjs';
import {createRetainedAttemptAssessor} from './retained-attempts.mjs';
import {runNativeObservationRecord} from './native-observation-record.mjs';
import {createFoottraceComputedMetadataReader} from './computed-proposal-metadata.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const reasons=['retained-workflow-unavailable','retained-workflow-discovery-drift','retained-source-version-unavailable',
 'candidate-effect-or-submission-uncertain','retained-attempts-unavailable','retained-native-nonterminal',
 'retained-native-effect-or-submission','current-native-stage-conflict','retained-native-history-incomplete',
 'retained-native-proposal-uncertain','candidate-reservation-or-publication','candidate-publication-unavailable',
 'metadata-current-observation-drift','metadata-current-input-observation-drift','computed-metadata-unavailable','metadata-observation-drift'];
const reason=v=>reasons.includes(v)?v:'metadata-history-unavailable';
/** Native snapshot history for the independent current metadata branch. Same
 * workflow/source/version/conflict/attempt engines; no fake preparationRefs,
 * historical creator or publication ledger. Input knowledge never grants effects.
 * Production accepts only actual invocation facts and an opaque runtime client.
 */
export function createFoottraceMetadataHistoryInspection(options={},predecessor) {
 let started=false,backend=null;
 const resultStageId='metadata-history-result';
 const initialize=scope=>{
  backend=null;
  if(started)throw new Error('metadata-history-already-executed');
  started=true;scope.metadataHistoryInvocation={readOnly:true,authorized:false};
 };
 // Only a separate trusted CODE builder may precede this source factory.
 // Public facade DATA start/executor fields are never forwarded here.
 const start=predecessor
  ?predecessor.addFunction('Capture one native metadata-history invocation',initialize,'metadata-history-invocation')
  :flowChart('Capture one native metadata-history invocation',initialize,'metadata-history-invocation');
 const input=createFoottraceMetadataInputBootstrap(options,start);
 const signed=createObservedAppCommitInspection({start:input.chart,readCommit:input.readCommit,readInputs:()=>{
  const b=input.getBackend();return b?{prepared:b.prepared,pending:b.pending,current:b.current}:null;
 }});
 let port,readWorkflows,readVersions,readCandidate,readMetadata;
 try{
  const context=foottraceInvocationContext(options.context);port=foottraceTransportPort(options.transport);
  if(port.repository.id!==context.repository.id)throw new Error();
  readMetadata=createFoottraceComputedMetadataReader({transport:options.transport,context});
  const profile=createFoottraceWorkflowProfile();
  readWorkflows=createRetainedWorkflowReader({api:port.api,repository:port.repository,profile});
  readVersions=createRetainedSourceVersionReader({api:port.api,repository:port.repository,packageName:'foottrace',profile,candidateScope:'current-target'});
  readCandidate=createFoottraceCandidatePublicationReader({api:port.api,registry:port.registry,repository:port.repository,candidateScope:'current-target'});
 }catch{port=null;}
 const assess=createRetainedAttemptAssessor(createFoottraceRetainedAttemptProfile());
 let inputs=null,observed=null,workflows=null,versions=null,attempts=null,candidate=null,metadata=null;
 const chart=signed.chart.addFunction('Initialize current metadata history observation',scope=>{
  inputs=input.getBackend();observed=signed.getBackend();
  const ready=port!==null&&inputs!==null&&observed!==null&&observed.sameTargetTree===true;
  scope.metadataHistoryFacts={ready,workflows:false,versions:false,attempts:false,candidate:false,metadata:false,metadataMatches:false,fresh:false,
   authorized:false,executedWrites:0,retainedEligibilityAdmitted:false,providerContinuityProved:false,
   reason:ready?'retained-workflow-unavailable':scope.metadataInputResult?.available?
    scope.proposeObservedResult?.reason??'metadata-inputs-unavailable':scope.metadataInputResult?.reason??'metadata-inputs-unavailable'};
  scope.metadataHistoryRefs=[];
 },'metadata-history-inputs')
 .addDeciderFunction('Current metadata inputs and signed state bound',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.ready===true,then:'metadata-history-read-workflows',label:'Read real retained native runs and numbered attempts'}
 ],'metadata-history-hold-workflows'),'metadata-history-entry-decision')
 .addFunctionBranch('metadata-history-read-workflows','Collect retained native workflow observations',async scope=>{
  try{
   const v=await readWorkflows();if(!v.valid)throw new Error();
   workflows=v;scope.metadataHistoryRefs=[{kind:'retained-workflows',receiptRef:v.digest}];
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,workflows:true,reason:'retained-source-version-unavailable'};
  }catch{/* Finite acquisition failure, never empty history. */}
 })
 .addFunctionBranch('metadata-history-hold-workflows','Retained workflow read blocked',()=>{}).setDefault('metadata-history-hold-workflows').end()
 .addDeciderFunction('Native retained workflow collection available',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.workflows===true,then:'metadata-history-read-versions',label:'Bind each actual source package and current target scope'}
 ],'metadata-history-hold-versions'),'metadata-history-version-decision')
 .addFunctionBranch('metadata-history-read-versions','Read immutable native source package versions',async scope=>{
  try{
   const v=await readVersions(inputs.prepared,workflows);
   if(!v.valid){scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:reason(v.reason)};return;}
   versions=v;scope.metadataHistoryRefs=[...scope.metadataHistoryRefs,{kind:'retained-source-versions',receiptRef:v.digest}];
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,versions:true,reason:'retained-attempts-unavailable'};
  }catch{/* No missing package/version fallback. */}
 })
 .addFunctionBranch('metadata-history-hold-versions','Source version observation blocked',()=>{}).setDefault('metadata-history-hold-versions').end()
 .addDeciderFunction('Actual retained source versions bound',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.versions===true,then:'metadata-history-assess-attempts',label:'Separate the exact current invocation and actual published L'}
 ],'metadata-history-hold-attempts'),'metadata-history-attempt-decision')
 .addFunctionBranch('metadata-history-assess-attempts','Classify actual retained native attempts',scope=>{
  const l=inputs.lineage;
  const v=assess({prepared:inputs.prepared,collection:workflows,versions,current:inputs.current,archive:inputs.archive,
   published:{predecessor:l.predecessor,version:l.version,tree:l.tree,archiveDigest:l.archiveDigest,producer:l.producer}});
  if(!v.valid||!v.eligible){scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:reason(v.reason)};return;}
  attempts=v;scope.metadataHistoryRefs=[...scope.metadataHistoryRefs,{kind:'retained-native-attempts',receiptRef:v.digest}];
  scope.metadataHistoryFacts={...scope.metadataHistoryFacts,attempts:true,reason:'candidate-publication-unavailable'};
 })
 .addFunctionBranch('metadata-history-hold-attempts','Retained attempt classification blocked',()=>{}).setDefault('metadata-history-hold-attempts').end()
 .addDeciderFunction('Finite retained attempts classified',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.attempts===true,then:'metadata-history-read-candidate',label:'Observe actual current candidate reservations and publication'}
 ],'metadata-history-hold-candidate'),'metadata-history-candidate-decision')
 .addFunctionBranch('metadata-history-read-candidate','Observe native candidate conflicts',async scope=>{
  try{
   const v=await readCandidate(inputs.prepared);
   if(!v.valid){scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:reason(v.reason)};return;}
   candidate=v;scope.metadataHistoryRefs=[...scope.metadataHistoryRefs,{kind:'current-candidate',receiptRef:v.digest}];
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,candidate:true,reason:'retained-workflow-discovery-drift'};
  }catch{/* Registry absence or failed reads never grant authority. */}
 })
 .addFunctionBranch('metadata-history-hold-candidate','Candidate observation blocked',()=>{}).setDefault('metadata-history-hold-candidate').end()
 .addDeciderFunction('Candidate observations joined to computed metadata',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.candidate===true,then:'metadata-history-read-metadata',label:'Compute desired title/body from actual current preparation and ONE native policy'}
 ],'metadata-history-hold-metadata'),'metadata-history-metadata-decision')
 .addFunctionBranch('metadata-history-read-metadata','Observe actual PR metadata against native computed payload',async scope=>{
  try{
   const value=await readMetadata(inputs.prepared,inputs.pending);
   if(!value.valid||value.scope!=='computed-current-metadata-only')throw new Error();
   metadata=value;scope.metadataHistoryRefs=[...scope.metadataHistoryRefs,{kind:'computed-current-metadata',
    receiptRef:digest({desired:value.observation.desiredDigest,observed:value.observation.observedDigest})}];
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,metadata:true,metadataMatches:value.observation.matches,
    reason:'retained-workflow-discovery-drift'};
  }catch{scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'computed-metadata-unavailable'};}
 })
 .addFunctionBranch('metadata-history-hold-metadata','Computed metadata observation blocked',()=>{}).setDefault('metadata-history-hold-metadata').end()
 .addDeciderFunction('Computed metadata observations joined',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.metadata===true,then:'metadata-history-recheck',label:'Reacquire complete native history and current signed/review/reference facts'}
 ],'metadata-history-hold-recheck'),'metadata-history-recheck-decision')
 .addFunctionBranch('metadata-history-recheck','Recheck native history and current state',async scope=>{
  try{
   const fresh=await readWorkflows();
   if(!fresh.valid||fresh.digest!==workflows.digest)return;
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'metadata-current-input-observation-drift'};
   if(!await input.reobserve())return;
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'retained-source-version-unavailable'};
   const freshVersions=await readVersions(inputs.prepared,fresh);
   if(!freshVersions.valid||freshVersions.digest!==versions.digest)return;
   const l=inputs.lineage;
   const freshAttempts=assess({prepared:inputs.prepared,collection:fresh,versions:freshVersions,current:inputs.current,archive:inputs.archive,
    published:{predecessor:l.predecessor,version:l.version,tree:l.tree,archiveDigest:l.archiveDigest,producer:l.producer}});
   if(!freshAttempts.valid||!freshAttempts.eligible||freshAttempts.digest!==attempts.digest)return;
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'candidate-publication-unavailable'};
   const freshCandidate=await readCandidate(inputs.prepared);
   if(!freshCandidate.valid){scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:reason(freshCandidate.reason)};return;}
   if(freshCandidate.digest!==candidate.digest)return;
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'metadata-current-observation-drift'};
   const current=await input.readCommit(inputs.prepared,inputs.pending,inputs.current);
   if(!current.valid||current.digest!==observed.digest){
    scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'metadata-current-observation-drift'};return;
   }
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'metadata-observation-drift'};
   const finalMetadata=await readMetadata(inputs.prepared,inputs.pending);
   const join=v=>({reference:v.observation.reference,desiredDigest:v.observation.desiredDigest,
    observedDigest:v.observation.observedDigest,matches:v.observation.matches});
   if(!finalMetadata.valid||!isDeepStrictEqual(join(finalMetadata),join(metadata))){
    scope.metadataHistoryFacts={...scope.metadataHistoryFacts,reason:'metadata-observation-drift'};return;
   }
   scope.metadataHistoryFacts={...scope.metadataHistoryFacts,fresh:true,reason:'metadata-history-observed'};
  }catch{/* No stale or uncertain observation is promoted. */}
 })
 .addFunctionBranch('metadata-history-hold-recheck','Fresh native reconciliation blocked',()=>{}).setDefault('metadata-history-hold-recheck').end()
 .addDeciderFunction('Current metadata history observation complete',scope=>decide(scope,[
  {when:s=>s.metadataHistoryFacts.ready&&s.metadataHistoryFacts.workflows&&s.metadataHistoryFacts.versions&&s.metadataHistoryFacts.attempts&&s.metadataHistoryFacts.candidate&&s.metadataHistoryFacts.metadata&&s.metadataHistoryFacts.fresh,
   then:'metadata-history-known',label:'Snapshot input knowledge only; no writer/full history/effect grant'}
 ],'metadata-history-held'),'metadata-history-final-decision')
 .addFunctionBranch('metadata-history-known','Native snapshot history known',()=>{
  backend=Object.freeze({...inputs,observedCommit:observed,workflows,versions,attempts,candidate,metadata});
 })
 .addFunctionBranch('metadata-history-held','Native history knowledge held',()=>{backend=null;}).setDefault('metadata-history-held').end()
 .addFunction('Record native metadata history result',scope=>{
  scope.metadataHistoryResult={...scope.metadataHistoryFacts,count:scope.metadataHistoryRefs.length,receiptRef:digest(scope.metadataHistoryRefs)};
 },resultStageId);
 // Backend is runtime INPUT knowledge only. Neither this accessor nor the
 // declared native stage ID proves completion, eligibility or permission.
 // The owning executor observes its actual completed prefix before continuing.
 return Object.freeze({chart,getBackend:()=>backend,resultStageId});
}
/** Complete read-only facade: incomplete native capture discards all backend
 * inputs. A composed caller owns its one executor and the whole run outcome.
 */
export async function runFoottraceMetadataHistoryInspection({recordLimitBytes,...options}={}) {
 const stage=createFoottraceMetadataHistoryInspection(options);
 const {record,snapshot}=await runNativeObservationRecord({chart:stage.chart,recordLimitBytes}),
  facts=snapshot?.sharedState?.metadataHistoryResult,backend=stage.getBackend();
 const known=record.complete&&backend!==null&&facts?.fresh===true;
 return {status:!record.complete?'incomplete':known?'metadata-history-only':'held',record,
  report:{authorized:false,executedWrites:0,reason:facts?.reason??'metadata-history-unavailable',retainedAttemptsEligible:record.complete&&facts?.attempts===true,
   retainedEligibilityAdmitted:false,providerContinuityProved:false,erasedHistoryProved:false,writerCredentialBindingAdmitted:false},
  backend:known?backend:null};
}
