import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {flowChart,decide} from 'footprintjs';
import {id} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {foottraceTransportPort} from './foottrace-transport.mjs';
import {createFoottraceMetadataParentSourceReader} from './foottrace-metadata-parent-source.mjs';
import {createFoottraceCurrentInputReader} from './foottrace-current-inputs.mjs';
import {createFoottraceProposerReader} from './current-proposer.mjs';
import {createFoottraceCurrentPreparationReader} from './current-preparation.mjs';
import {createFoottraceLineageObservationReader} from './foottrace-lineage.mjs';
import {createFoottracePendingObservationReader} from './foottrace-pending.mjs';
import {createFoottraceReviewObservationReader} from './foottrace-reviews.mjs';
import {createObservedAppCommitReader} from './observed-app-commit.mjs';
import {runObservedAppCommitInspection} from './observed-commit-flow.mjs';
const reviewReason=value=>['effective-approval','effective-refusal','pending-review','review-evidence-unavailable'].includes(value)?value:'review-evidence-unavailable';
const reviewJoin=value=>({reference:value.reference,reviewDigest:value.reviewDigest,permissionDigest:value.permissionDigest,reviewCount:value.reviewCount,reviewerCount:value.reviewerCount,priorHeadApprovalReviews:value.priorHeadApprovalReviews});
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
/** Current-only ordinary metadata INPUT path. No historical preparation creator
 * is chosen. This is separate from the bounded ref-refresh witness path and
 * still leaves source-parent eligibility, full retained history/writer/effects
 * unadmitted. Every mutable native guard is required again before any effect.
 */
export function createFoottraceMetadataInputBootstrap({transport,context,artifactId}={}) {
 let pinned,port,readInputs,readCurrent,readArchive,readLineage,readPending,readCommit,readParentSource,readReviews;
 try{
  pinned=foottraceInvocationContext(context);id(artifactId);port=foottraceTransportPort(transport);
  if(port.repository.id!==pinned.repository.id)throw new Error();
  const sourceContext={repository:pinned.repository,sha:pinned.sha};
  readInputs=createFoottraceCurrentInputReader({transport,context:pinned});
  readCurrent=createFoottraceProposerReader({transport,context:pinned});
  readArchive=createFoottraceCurrentPreparationReader({api:port.api,context:pinned,artifactId,readCurrentProposer:readCurrent});
  readLineage=createFoottraceLineageObservationReader({transport:port,context:sourceContext,settings:port.settings});
  readPending=createFoottracePendingObservationReader({api:port.api,context:sourceContext,settings:{slug:port.settings.slug}});
  readReviews=createFoottraceReviewObservationReader({api:port.api,context:sourceContext,settings:{slug:port.settings.slug}});
  readParentSource=createFoottraceMetadataParentSourceReader({transport,context:pinned});
  const observeCommit=createObservedAppCommitReader({api:port.api,repository:port.repository,settings:port.settings,readCurrentProposer:readCurrent});
  readCommit=async(prepared,pending,current)=>{
   const value=await observeCommit(prepared,pending,current);
   if(!value.valid)return value;
   const fresh=await readPending();
   if(!fresh.valid||!isDeepStrictEqual(fresh.reference,pending.reference))
    return {valid:false,reason:'metadata-pending-observation-drift',authorized:false};
   const freshReviews=await readReviews(pending.reference);
   if(!freshReviews.valid)return {valid:false,reason:reviewReason(freshReviews.reason),authorized:false};
   if(!isDeepStrictEqual(reviewJoin(freshReviews),reviewJoin(reviews)))
    return {valid:false,reason:'metadata-review-observation-drift',authorized:false};
   const final=await readPending();
   if(!final.valid||!isDeepStrictEqual(final.reference,pending.reference))
    return {valid:false,reason:'metadata-pending-observation-drift',authorized:false};
   return value;
  };
 }catch{port=null;}
 let prepared=null,current=null,archive=null,lineage=null,pending=null,parentSource=null,reviews=null,available=false;
 const chart=flowChart('Discover current ordinary target independently',async scope=>{
  scope.metadataInputFacts={currentInputs:false,currentIdentity:false,currentArchive:false,lineage:false,pending:false,parentSource:false,reviews:false,sameTarget:false,
   available:false,reason:'metadata-context-unavailable',authorized:false,executedWrites:0,originalProducerAttributed:false};
  scope.metadataInputRefs=[];
  if(!port)return;
  try{
   const value=await readInputs();
   if(!value.valid){scope.metadataInputFacts={...scope.metadataInputFacts,reason:value.reason==='ordinary-active-recovery'?'ordinary-active-recovery':'current-prepared-inputs-unavailable'};return;}
   if(value.scope!=='native-current-prepared-inputs-only'||value.authorized!==false||value.prepared.sourceSha!==pinned.sha)throw new Error();
   prepared=value.prepared;scope.metadataInputRefs=[{kind:'current-preparation',receiptRef:value.digest,sourceSha:prepared.sourceSha}];
   scope.metadataInputFacts={...scope.metadataInputFacts,currentInputs:true,reason:'current-proposer-unavailable'};
  }catch{/* Closed current-input refusal. */}
 },'metadata-current-inputs')
 .addDeciderFunction('Current ordinary inputs independently bound',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.currentInputs===true,then:'metadata-read-current',label:'Actual current invocation, never a historical creator'}
 ],'metadata-hold-current'),'metadata-current-input-decision')
 .addFunctionBranch('metadata-read-current','Read actual current private App and producer',async scope=>{
  try{
   const value=await readCurrent(prepared);
   if(!value.valid||value.scope!=='current-proposer-identity-only'||value.privateAppIdentityAdmitted!==true||value.authorized!==false)throw new Error();
   current=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'current-proposer',receiptRef:value.digest,sourceSha:prepared.sourceSha}];
   scope.metadataInputFacts={...scope.metadataInputFacts,currentIdentity:true,reason:'current-preparation-unavailable'};
  }catch{/* Current identity unavailable. */}
 })
 .addFunctionBranch('metadata-hold-current','Current producer input blocked',()=>{}).setDefault('metadata-hold-current').end()
 .addDeciderFunction('Actual current producer bound',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.currentIdentity===true,then:'metadata-read-archive',label:'Join exact current prepare ZIP and whole deterministic payload'}
 ],'metadata-hold-archive'),'metadata-current-identity-decision')
 .addFunctionBranch('metadata-read-archive','Admit actual current preparation archive',async scope=>{
  try{
   const value=await readArchive(prepared,current);
   if(!value.valid||value.scope!=='current-preparation-archive-only'||value.authorized!==false)throw new Error();
   archive=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'current-archive',receiptRef:value.digest,sourceSha:prepared.sourceSha}];
   scope.metadataInputFacts={...scope.metadataInputFacts,currentArchive:true,reason:'published-lineage-unavailable'};
  }catch{/* Actual current archive unavailable. */}
 })
 .addFunctionBranch('metadata-hold-archive','Current preparation archive blocked',()=>{}).setDefault('metadata-hold-archive').end()
 .addDeciderFunction('Current archive bound',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.currentArchive===true,then:'metadata-read-lineage',label:'Discover actual published L independently'}
 ],'metadata-hold-lineage'),'metadata-current-archive-decision')
 .addFunctionBranch('metadata-read-lineage','Read actual native published predecessor',async scope=>{
  try{
   const value=await readLineage();
   if(!value.valid||value.scope!=='published-lineage-only'||value.sourceSha!==prepared.sourceSha||
    value.sourceTree!==prepared.sourceTree||value.version!==prepared.fromVersion||value.authorized!==false)throw new Error();
   lineage=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'published-lineage',receiptRef:digest({predecessor:value.predecessor,version:value.version,archiveDigest:value.archiveDigest})}];
   scope.metadataInputFacts={...scope.metadataInputFacts,lineage:true,reason:'pending-reference-unavailable'};
  }catch{/* Published lineage unavailable. */}
 })
 .addFunctionBranch('metadata-hold-lineage','Published predecessor blocked',()=>{}).setDefault('metadata-hold-lineage').end()
 .addDeciderFunction('Actual published lineage bound',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.lineage===true,then:'metadata-read-pending',label:'Discover exact single current App PR/ref'}
 ],'metadata-hold-pending'),'metadata-lineage-decision')
 .addFunctionBranch('metadata-read-pending','Observe actual single pending App reference',async scope=>{
  try{
   const value=await readPending();
   if(!value.valid||value.scope!=='pending-reference-only'||value.reference.source!==prepared.sourceSha||
    value.reference.botId!==current.identity.botId||value.authorized!==false)throw new Error();
   pending=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'pending-reference',receiptRef:digest(value.reference)}];
   scope.metadataInputFacts={...scope.metadataInputFacts,pending:true,sameTarget:value.reference.tree===prepared.targetTree,
    parentSourceMatchesCurrent:value.reference.parents[0]===prepared.sourceSha,reason:'metadata-target-mismatch'};
  }catch{/* Exact pending reference unavailable. */}
 })
 .addFunctionBranch('metadata-hold-pending','Pending App reference blocked',()=>{}).setDefault('metadata-hold-pending').end()
 .addDeciderFunction('Pending target matches current preparation',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.sameTarget===true,then:'metadata-read-parent-source',label:'Bind actual immediate parent data without guessing a creator'}
 ],'metadata-hold-parent-source'),'metadata-parent-source-entry')
 .addFunctionBranch('metadata-read-parent-source','Bind immediate parent source and unchanged raw queue',async scope=>{
  scope.metadataInputFacts={...scope.metadataInputFacts,reason:'metadata-parent-source-unavailable'};
  try{
   const value=await readParentSource(prepared,pending,lineage);
   if(!value.valid||value.scope!=='metadata-parent-source-only'||value.authorized!==false)throw new Error();
   parentSource=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'metadata-parent-source',receiptRef:value.digest}];
   scope.metadataInputFacts={...scope.metadataInputFacts,parentSource:true,reason:'metadata-inputs-unavailable'};
  }catch{/* Immediate parent data unavailable; no creator/ref-write inference. */}
 })
 .addFunctionBranch('metadata-hold-parent-source','Parent source reconstruction blocked',()=>{}).setDefault('metadata-hold-parent-source').end()
 .addDeciderFunction('Immediate parent source bound',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.parentSource===true,then:'metadata-read-reviews',label:'Read actual current-reference reviews and permissions without original-creator inference'}
 ],'metadata-hold-reviews'),'metadata-review-decision')
 .addFunctionBranch('metadata-read-reviews','Observe current native reviews and permissions',async scope=>{
  scope.metadataInputFacts={...scope.metadataInputFacts,reason:'review-evidence-unavailable'};
  try{
   const value=await readReviews(pending.reference);
   if(!value.valid){scope.metadataInputFacts={...scope.metadataInputFacts,reason:reviewReason(value.reason)};return;}
   if(value.scope!=='pending-reviews-only'||value.authorized!==false||value.retainedEligibilityAdmitted!==false||
    !isDeepStrictEqual(value.reference,pending.reference))throw new Error();
   reviews=value;scope.metadataInputRefs=[...scope.metadataInputRefs,{kind:'metadata-reviews',receiptRef:digest(reviewJoin(value))}];
   scope.metadataInputFacts={...scope.metadataInputFacts,reviews:true,reason:'metadata-inputs-unavailable'};
  }catch{/* Only finite review refusal codes enter scope. */}
 })
 .addFunctionBranch('metadata-hold-reviews','Current reference review observation blocked',()=>{}).setDefault('metadata-hold-reviews').end()
 .addDeciderFunction('Same current deterministic target observed',scope=>decide(scope,[
  {when:s=>s.metadataInputFacts.currentInputs===true&&s.metadataInputFacts.currentIdentity===true&&s.metadataInputFacts.currentArchive===true&&s.metadataInputFacts.lineage===true&&s.metadataInputFacts.pending===true&&s.metadataInputFacts.sameTarget===true&&s.metadataInputFacts.parentSource===true&&s.metadataInputFacts.reviews===true,then:'metadata-input-known',label:'Current archive, published L and same-tree P known; full eligibility remains separate'}
 ],'metadata-input-held'),'metadata-target-decision')
 .addFunctionBranch('metadata-input-known','Current metadata inputs known',scope=>{
  available=true;scope.metadataInputFacts={...scope.metadataInputFacts,available:true,reason:'metadata-inputs-bound'};
 })
 .addFunctionBranch('metadata-input-held','Current metadata inputs unavailable',()=>{}).setDefault('metadata-input-held').end()
 .addFunction('Record current metadata input knowledge',scope=>{
  scope.metadataInputResult={...scope.metadataInputFacts,count:scope.metadataInputRefs.length,receiptRef:digest(scope.metadataInputRefs)};
 },'metadata-input-result');
 return {chart,readCommit,getBackend:()=>available?{prepared,current,archive,lineage,pending,parentSource,reviews}:null};
}
/** Production read-only entry. No saved witnesses/readers/model callbacks enter,
 * and a single executor records both current bootstrap and observed App commit.
 */
export async function runFoottraceMetadataInputInspection({recordLimitBytes,...options}={}) {
 const stage=createFoottraceMetadataInputBootstrap(options);
 const result=await runObservedAppCommitInspection({start:stage.chart,readCommit:stage.readCommit,readInputs:()=>{
  const b=stage.getBackend();return b?{prepared:b.prepared,pending:b.pending,current:b.current}:null;
 },recordLimitBytes});
 const inputs=stage.getBackend(),facts=result.record.snapshot?.sharedState?.metadataInputResult;
 const known=result.status==='observed-commit-only'&&inputs!==null&&result.backend.sameTargetTree===true;
 return {status:!result.record.complete?'incomplete':known?'metadata-inputs-only':'held',record:result.record,
  report:{...result.report,reason:known?'metadata-inputs-bound':facts?.available?result.record.snapshot.sharedState.proposeObservedResult.reason:facts?.reason??'metadata-inputs-unavailable',
   writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,metadataParentSourceObserved:facts?.parentSource===true,metadataReviewsObserved:facts?.reviews===true,allParentSourceGuardsAdmitted:false},
  backend:known?Object.freeze({...inputs,observedCommit:result.backend}):null};
}
