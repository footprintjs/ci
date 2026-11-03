import {isDeepStrictEqual} from 'node:util';
import {FlowChartExecutor,decide} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../record.mjs';
import {createFoottraceMetadataWriterBootstrap} from './proposal-bootstrap-flow.mjs';
import {createFoottraceMetadataHistoryInspection} from './foottrace-metadata-history.mjs';
import {createFoottraceMetadataCheckReader} from './foottrace-metadata-checks.mjs';
import {createFoottraceComputedMetadataReader} from './computed-proposal-metadata.mjs';
import {foottraceMetadataPatchPort} from './foottrace-transport.mjs';
import {bindProposalMetadata} from './proposal-metadata-payload.mjs';
import {own} from './source-inventory.mjs';
import {createProposalOutcomeOutput} from './proposal-outcome-output.mjs';
const fail=()=>{throw new Error('metadata-c1-unavailable');};
function returnedExact(reply,expected,payload,repository){
 const data=own(reply,'data'),head=own(data,'head'),base=own(data,'base'),actor=own(data,'user');
 if(own(data,'number')!==expected.pr||own(data,'state')!=='open'||own(data,'merged')!==false||
  own(data,'auto_merge')!==null||own(data,'merged_at')!==null||
  own(actor,'id')!==expected.botId||own(actor,'type')!=='Bot'||own(head,'sha')!==expected.head||own(head,'ref')!=='release/next'||
  own(base,'sha')!==expected.observedBase||own(base,'ref')!=='main'||
  own(own(head,'repo'),'id')!==repository.id||own(own(base,'repo'),'id')!==repository.id||
  own(own(head,'repo'),'full_name')!==repository.full_name||own(own(base,'repo'),'full_name')!==repository.full_name||
  !isDeepStrictEqual(bindProposalMetadata(data),payload))fail();
}
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
 const captured=root.getInvocationInput();let executor,checks=null,observeMetadata=null,baseline=null;
 let patchAttempts=0,submission='not-attempted',outcome=null;
 try{checks=createFoottraceMetadataCheckReader(captured);observeMetadata=createFoottraceComputedMetadataReader(captured);}catch{/* Unavailable CODE capture remains technical. */}
 const completed=id=>{
  const snapshot=executor.getSnapshot(),log=snapshot.commitLog;
  return executor.getCommitCount()===log.length&&log.some(row=>row.stageId===id);
 };
 const predecessor=root.chart.addFunction('Require actual completed writer source prefix',()=>{
  if(root.getBackend()===null||!completed(root.resultStageId)||(outputFactory!==null&&outputWriter===null))fail();
 },'metadata-c1-root-boundary');
 const history=createFoottraceMetadataHistoryInspection(captured??{},predecessor);
 const reacquire=async()=>{
  if(baseline===null||!await root.reobserve()||!await history.reobserve())fail();
  const fresh=await checks(baseline.pending.reference);
  if(!fresh.valid||fresh.digest!==baseline.checks.digest||!await root.reobserve())fail();
  const metadata=await observeMetadata(baseline.prepared,baseline.pending);
  if(!metadata.valid||!isDeepStrictEqual(metadata.observation,baseline.metadata.observation))fail();
  return metadata;
 };
 let chart=history.chart.addFunction('Join current native history and required checks on ONE writer owner',async scope=>{
  if(!completed(history.resultStageId)||checks===null||observeMetadata===null)fail();
  const current=root.getBackend(),observed=history.getBackend();
  if(current===null||observed===null||!isDeepStrictEqual(current.prepared,observed.prepared)||
   current.current.digest!==observed.current.digest||!await root.reobserve())fail();
  const required=await checks(observed.pending.reference);if(!required.valid)fail();
  baseline={...observed,checks:required};
  scope.metadataC1Facts={metadataMatches:observed.metadata.observation.matches,verified:false,needsVerify:false,
   patchAttempts:0,submission:'not-attempted',releaseReady:false,authorized:false};
 },'metadata-c1-current-inputs')
 .addFunction('Commit actual native C1 pre-effect decision',scope=>{
  if(baseline===null)fail();
  scope.metadataC1PreEffect={headSha:baseline.pending.reference.head,treeSha:baseline.pending.reference.tree,
   receiptRef:baseline.checks.digest,authorized:false};
 },'metadata-c1-pre-effect')
 .addDeciderFunction('Exact current metadata needs no mutation',scope=>decide(scope,[
  {when:s=>s.metadataC1Facts.metadataMatches===true,then:'metadata-c1-noop',label:'Reacquire complete native state and verify exact metadata without PATCH'}
 ],'metadata-c1-apply'),'metadata-c1-effect-decision')
 .addFunctionBranch('metadata-c1-noop','Recheck the actual completed no-op branch',async scope=>{
  if(!completed('metadata-c1-pre-effect'))fail();
  const metadata=await reacquire();if(metadata.observation.matches!==true)fail();
  scope.metadataC1Facts={...scope.metadataC1Facts,verified:true};
 })
 .addFunctionBranch('metadata-c1-apply','Recheck native predicates immediately before ONE exact metadata PATCH',async scope=>{
  if(!completed('metadata-c1-pre-effect'))fail();
  const metadata=await reacquire();if(metadata.observation.matches!==false)fail();
  const payload=bindProposalMetadata(metadata.payload,true);
  const port=foottraceMetadataPatchPort(captured.transport,{pullNumber:baseline.pending.reference.pr,desired:payload});
  let reply;
  try{patchAttempts++;reply=await port.setExact();}
  catch{submission=port.observation().state;if(submission!=='uncertain')fail();}
  submission=port.observation().state;
  if(submission==='returned')returnedExact(reply,baseline.pending.reference,payload,captured.context.repository);
  else if(submission!=='uncertain')fail();
  scope.metadataC1Facts={...scope.metadataC1Facts,needsVerify:true,patchAttempts,submission};
 }).setDefault('metadata-c1-apply').end()
 .addDeciderFunction('Submitted exact metadata requires GET-only verification',scope=>decide(scope,[
  {when:s=>s.metadataC1Facts.needsVerify===true,then:'metadata-c1-get-verify',label:'No second PATCH, including a stale or uncertain response'}
 ],'metadata-c1-already-exact'),'metadata-c1-verification-decision')
 .addFunctionBranch('metadata-c1-get-verify','Verify actual exact PR metadata on the same writer owner',async scope=>{
  const value=await observeMetadata(baseline.prepared,baseline.pending);if(!value.valid)fail();
  if(!value.observation.matches&&submission!=='uncertain')fail();
  scope.metadataC1Facts={...scope.metadataC1Facts,verified:true,metadataMatches:value.observation.matches};
 })
 .addFunctionBranch('metadata-c1-already-exact','No mutation was needed',()=>{}).setDefault('metadata-c1-already-exact').end()
 .addDeciderFunction('Closed native C1 metadata verification',scope=>decide(scope,[
  {when:s=>s.metadataC1Facts.verified===true&&s.metadataC1Facts.metadataMatches===true,
   then:'metadata-c1-match',label:'Exact observed metadata only; no release readiness grant'},
  {when:s=>s.metadataC1Facts.verified===true&&s.metadataC1Facts.metadataMatches===false&&s.metadataC1Facts.submission==='uncertain',
   then:'metadata-c1-hold',label:'Verified stale after uncertain PATCH: HOLD this invocation'}
 ],'metadata-c1-technical'),'metadata-c1-outcome-decision')
 .addFunctionBranch('metadata-c1-match','Exact metadata reconciled',()=>{outcome='metadata-match';})
 .addFunctionBranch('metadata-c1-hold','Metadata remains stale after uncertainty',()=>{outcome='metadata-hold';})
 .addFunctionBranch('metadata-c1-technical','Unverified state stays technical',fail).setDefault('metadata-c1-technical').end()
 .addFunction('Record actual closed C1 native terminal',scope=>{
  const facts=scope.metadataC1Facts;
  if(outcome===null||facts.verified!==true||facts.metadataMatches!==(outcome==='metadata-match'))fail();
  scope.metadataC1Result={status:outcome==='metadata-match'?'match':'held',verified:true,patchAttempts,submission,
   releaseReady:false,authorized:false};
 },'metadata-c1-terminal');
 if(outputFactory!==null)chart=chart.addFunction('Persist fixed named outcome after the actual native C1 terminal',async scope=>{
  const terminal=scope.metadataC1Result;
  if(!completed('metadata-c1-terminal')||outcome===null||outputWriter===null||terminal?.verified!==true||
   terminal.status!==(outcome==='metadata-match'?'match':'held'))fail();
  outputFacts.attempted=true;scope.metadataC1OutputFacts={...outputFacts};
  try{await outputWriter.write(outcome);outputFacts.saved=true;}
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
 const status=record.complete&&outcome!==null?outcome:'technical-failure';
 return {status,record,report:{patchAttempts,submission,output:{...outputFacts},releaseReady:false,authorized:false,
  appIdentityObservation:root.getBackend()!==null?'start-of-job-key-holder-facts':'unavailable',privateAppIdentityAdmitted:false,
  writerCredentialBindingAdmitted:false,
  proposeOutcome:status==='metadata-hold'?'hold-metadata-stale':status==='metadata-match'?'metadata-matched':'technical-failure'}};
}
