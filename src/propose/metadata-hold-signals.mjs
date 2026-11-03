import {flowChart,decide} from 'footprintjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
const ownedSignals=new WeakSet();
export const isMetadataHoldSignal=value=>ownedSignals.has(value);
const conclusions=[null,'success','failure','cancelled','skipped','neutral','timed_out','action_required'];
const fail=()=>{throw new Error('metadata-hold-source-unavailable');};
/** Negative diagnostic signals ONLY. A reported HOLD never admits the closed
 * metadata branch, fresh verification, provider-job completion or any effect.
 * The effect controller must separately complete every native predicate/stage.
 * Output/summary persistence, actual eco collection and workflow gates are not
 * performed here; returned text cannot be used as a saved grant.
 */
export function createMetadataHoldSignalStage(options={}){
 const readHold=own(options,'readHold'),start=Object.hasOwn(options,'start')?own(options,'start'):undefined;
 if(typeof readHold!=='function')fail();
 let started=false,signals=null;
 const initialize=scope=>{
  signals=null;if(started)throw new Error('metadata-hold-already-executed');started=true;
  scope.metadataHoldFacts={observed:false,downstreamBlocked:true,terminalAdmission:false,authorized:false};
 };
 const initial=start?start.addFunction('Observe reported metadata business HOLD',initialize,'metadata-hold-input'):
  flowChart('Observe reported metadata business HOLD',initialize,'metadata-hold-input');
 const chart=initial.addFunction('Read the closed negative business outcome',async scope=>{
  try{
   const value=fields(jsonData(await readHold(),4096),['proposeOutcome','jobConclusion']);
   if(value.proposeOutcome!=='hold-metadata-stale'||!conclusions.includes(value.jobConclusion))fail();
   scope.metadataHoldFacts={...scope.metadataHoldFacts,observed:true};
  }catch{/* Raw source/data/error bytes never enter tracked state. */}
 },'metadata-hold-read')
 .addDeciderFunction('Reported stale metadata HOLD is explicit',scope=>decide(scope,[
  {when:s=>s.metadataHoldFacts.observed===true,then:'metadata-hold-signals',label:'Keep the named business HOLD open and block downstream continuation'}
 ],'metadata-hold-unavailable'),'metadata-hold-decision')
 .addFunctionBranch('metadata-hold-signals','Prepare bounded negative signals',()=>{
  signals=Object.freeze({businessStatus:'held',proposeOutcome:'hold-metadata-stale',
   output:'proposeOutcome=hold-metadata-stale\n',
   summary:'### Propose held\n\nReported metadata remains stale. Release readiness is unadmitted.\n',
   ecoFinding:'metadata-stale',downstreamBlocked:true,terminalAdmission:false,releaseReady:false,authorized:false});
  ownedSignals.add(signals);
 })
 .addFunctionBranch('metadata-hold-unavailable','Unknown outcome cannot supply business readiness',()=>{}).setDefault('metadata-hold-unavailable').end()
 .addFunction('Record negative metadata outcome only',scope=>{
  scope.metadataHoldResult={observed:scope.metadataHoldFacts.observed,downstreamBlocked:true,
   terminalAdmission:false,releaseReady:false,authorized:false};
 },'metadata-hold-result');
 return Object.freeze({chart,resultStageId:'metadata-hold-result',getSignals:()=>signals});
}
