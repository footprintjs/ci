import {isDeepStrictEqual} from 'node:util';
import {createFoottraceRolloverInspection} from './foottrace-rollover-inspection.mjs';
import {createFoottraceRolloverObjectReader,createFoottraceRolloverTransitionObjectReader} from './proposal-object-observation.mjs';
import {createFoottraceRolloverObjectPlan} from './proposal-object-plan.mjs';
import {appendFoottraceRolloverObjectPhase} from './proposal-object-flow.mjs';
const fail=()=>{throw new Error('rollover-object-preparation-unavailable');};
/** Private ordinary CODE caller of the SAME native object phase. One captured
 * owner and one actual executor; no pending witnesses or L-as-P adaptation.
 * Native INPUT completeness never admits a production bridge or release.
 */
export function appendFoottraceRolloverPreparation({chart:start,captured,root,completed,execution,continuation=null}){
 let baseline=null,plan=null,objects=null;
 try{
  const nativeObjects=createFoottraceRolloverObjectReader(captured);
  objects=Object.freeze({
   blob:input=>nativeObjects.blob(input),
   tree:prepared=>nativeObjects.tree(prepared),
   commit:(prepared,input)=>{
    if(baseline===null)fail();
    // Parent/source authority was independently admitted by the owning native
    // inspection. Rejoin actual published L for signed-object observation,
    // rather than recursively repeating the whole proposal/ref engine here.
    return createFoottraceRolloverTransitionObjectReader(captured,baseline).commit(prepared,input);
   }
  });
 }catch{/* Root boundary remains technical. */}
 const predecessor=start.addFunction('Require the actual ordinary native writer source prefix',()=>{
  if(root.getInvocationInput()!==captured||root.getBackend()===null||!completed(root.resultStageId)||objects===null)fail();
 },'rollover-objects-root-boundary');
 const inspection=createFoottraceRolloverInspection(captured??{},predecessor);
 const bind=()=>{
  const b=inspection.getBackend(),current=root.getBackend();
  if(b===null||current===null||b.attempts?.eligible!==true||b.attempts.valid!==true||
   !isDeepStrictEqual(current.prepared,b.prepared)||current.current.digest!==b.current.digest)fail();
  return b;
 };
 const recheck=async()=>{
  if(baseline===null||!completed(inspection.resultStageId)||!await inspection.reobserve())fail();
  const fresh=bind();
  if(fresh!==baseline||!await root.reobserve())fail();
 };
 const prefix=inspection.chart.addFunction('Join actual ordinary native eligibility with the SAME captured source',async scope=>{
  if(!completed(inspection.resultStageId)||!await root.reobserve())fail();
  baseline=bind();plan=createFoottraceRolloverObjectPlan({repository:captured.context.repository,
   prepared:baseline.prepared,rollover:baseline.rollover});
  scope.rolloverObjectFacts={count:0,executedWrites:0,verified:false,authorized:false,releaseReady:false};
 },'rollover-objects-inputs');
 const phase=appendFoottraceRolloverObjectPhase({chart:prefix,captured,execution,recheck,objects,
  getInput:()=>({prepared:baseline?.prepared,previousHead:baseline?.rollover.reference.retainedHeadSha,plan})});
 const next=continuation===null?null:continuation({chart:phase.chart,captured,root,inspection,objects,recheck,completed,execution,
  state:()=>({baseline,...phase.state()})});
 return Object.freeze({chart:next===null?phase.chart:next.chart,resultStageId:next===null?phase.resultStageId:next.resultStageId,
  status:()=>next===null?(phase.state().uncertain?'rollover-verify-only':'rollover-prepared'):next.status(),
  report:()=>{
   const {verified,...facts}=phase.report();
   return {...facts,...(next===null?{verified}:{objectsVerified:verified}),originalProducerAttributed:false,
    writerCredentialBindingAdmitted:false,...(next===null?{}:next.report())};
  }});
}
