import {flowChart,decide} from 'footprintjs';
import {own} from './source-inventory.mjs';
import {isMetadataHoldSignal} from './metadata-hold-signals.mjs';
import {createMetadataHoldOutput} from './metadata-hold-output.mjs';
/** Actual LOCAL diagnostic IO in the owning native chart. No provider effect,
 * current-writer permission or technical C1 terminal is admitted. The caller
 * owns its executor and must not label this chart read-only.
 */
export function createMetadataHoldPersistenceStage(options={}){
 const readSignal=own(options,'readSignal'),start=Object.hasOwn(options,'start')?own(options,'start'):undefined;
 if(typeof readSignal!=='function')throw new Error('metadata-hold-persistence-source-unavailable');
 const writer=createMetadataHoldOutput({appendSummary:own(options,'appendSummary'),appendOutput:own(options,'appendOutput')});
 let started=false,signal=null,result=null;
 const initialize=scope=>{
  signal=null;result=null;
  if(started)throw new Error('metadata-hold-persistence-already-executed');started=true;
  if(scope.readOnly===true)throw new Error('metadata-hold-persistence-read-only-context');
  scope.metadataHoldOutputFacts={available:false,attempted:false,saved:false,partialSavePossible:false};
 };
 const initial=start?start.addFunction('Begin local diagnostic output saving',initialize,'metadata-hold-output-input'):
  flowChart('Begin local diagnostic output saving',initialize,'metadata-hold-output-input');
 const chart=initial.addFunction('Read the runtime-owned negative signal',async scope=>{
  try{const value=await readSignal();if(isMetadataHoldSignal(value)){signal=value;scope.metadataHoldOutputFacts={...scope.metadataHoldOutputFacts,available:true};}}
  catch{/* No raw source object or error enters native state. */}
 },'metadata-hold-output-read')
 .addDeciderFunction('Only an owned negative signal may be saved',scope=>decide(scope,[
  {when:s=>s.metadataHoldOutputFacts.available,then:'metadata-hold-output-save',label:'Save fixed summary then named HOLD output once'}
 ],'metadata-hold-output-unavailable'),'metadata-hold-output-decision')
 .addFunctionBranch('metadata-hold-output-save','Await both local diagnostic writes',async scope=>{
  scope.metadataHoldOutputFacts={...scope.metadataHoldOutputFacts,attempted:true};
  try{await writer.write(signal);scope.metadataHoldOutputFacts={...scope.metadataHoldOutputFacts,saved:true};}
  catch{scope.metadataHoldOutputFacts={...scope.metadataHoldOutputFacts,partialSavePossible:true};}
 })
 .addFunctionBranch('metadata-hold-output-unavailable','Unavailable signal blocks diagnostic saving',()=>{}).setDefault('metadata-hold-output-unavailable').end()
 .addFunction('Record local save result without terminal authority',scope=>{
  const facts=scope.metadataHoldOutputFacts;
  result=Object.freeze({diagnosticSaved:facts.saved,partialSavePossible:facts.partialSavePossible,
   downstreamBlocked:true,terminalAdmission:false,releaseReady:false,authorized:false});
  scope.metadataHoldOutputResult=result;
 },'metadata-hold-output-result');
 return Object.freeze({chart,resultStageId:'metadata-hold-output-result',getResult:()=>result});
}
