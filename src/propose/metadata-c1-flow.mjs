import {requireExactProposalMetadataReply as returnedExact} from './proposal-metadata-reply.mjs';
import {isDeepStrictEqual} from 'node:util';
import {decide} from 'footprintjs';
import {createFoottraceMetadataHistoryInspection} from './foottrace-metadata-history.mjs';
import {createFoottraceMetadataCheckReader} from './foottrace-metadata-checks.mjs';
import {createFoottraceComputedMetadataReader} from './computed-proposal-metadata.mjs';
import {foottraceMetadataPatchPort} from './foottrace-transport.mjs';
import {bindProposalMetadata} from './proposal-metadata-payload.mjs';
const fail=()=>{throw new Error('metadata-c1-unavailable');};
/** Private CODE composition of the SAME C1 recipe. The enclosing native route
 * owns the capture/chart/executor and actual completed-stage predicate. Public
 * DATA facades never forward these ports. No source/writer/effect clearance,
 * seventh credential holder, nested executor or saved authority is introduced.
 */
export function appendFoottraceMetadataReconciliation({chart:start,captured,root,completed}){
 let checks=null,observeMetadata=null,baseline=null;
 let patchAttempts=0,submission='not-attempted',outcome=null;
 try{checks=createFoottraceMetadataCheckReader(captured);observeMetadata=createFoottraceComputedMetadataReader(captured);}catch{/* Unavailable CODE capture remains technical. */}
 const predecessor=start.addFunction('Require actual completed writer source prefix',()=>{
  if(root.getInvocationInput()!==captured||root.getBackend()===null||!completed(root.resultStageId))fail();
 },'metadata-c1-root-boundary');
 const history=createFoottraceMetadataHistoryInspection(captured??{},predecessor);
 const reacquire=async()=>{
  if(baseline===null||!await root.reobserve()||!await history.reobserve())fail();
  const fresh=await checks(baseline.pending.reference);
  if(!fresh.valid||fresh.digest!==baseline.checks.digest||!await root.reobserve())fail();
  const metadata=await observeMetadata(baseline.prepared,baseline.pending);
  if(!metadata.valid||!isDeepStrictEqual(metadata.observation,baseline.metadata.observation)||!await root.reobserve())fail();
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
 return Object.freeze({chart,resultStageId:'metadata-c1-terminal',outcome:()=>outcome,
  report:()=>({patchAttempts,submission,releaseReady:false,authorized:false})});
}
