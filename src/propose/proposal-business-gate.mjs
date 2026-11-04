import {createHash} from 'node:crypto';
import {flowChart,decide} from 'footprintjs';
import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
const observations=new WeakSet();
const conclusions=[null,'success','failure','cancelled','skipped','neutral','timed_out','action_required'];
const fail=()=>{throw new Error('proposal-business-output-unavailable');};
const reports={
 held:{status:'held',businessGatePassed:false,finding:'metadata-stale'},
 uncertain:{status:'held',businessGatePassed:false,finding:'proposal-submission-uncertain'},
 matched:{status:'matched',businessGatePassed:true,finding:null},
 'job-not-successful':{status:'held',businessGatePassed:false,finding:'proposal-job-not-successful'},
 unknown:{status:'unknown',businessGatePassed:false,finding:'proposal-outcome-unavailable'}
};
/** Read one reported job output. This gates BUSINESS continuation only.
 * A reported match plus SUCCESS is not native eligibility, fresh verification,
 * technical-terminal admission or release/writer authority. No provider writes.
 */
export function createProposalBusinessGate(options={}){
 const readOutput=own(options,'readOutput'),start=Object.hasOwn(options,'start')?own(options,'start'):undefined;
 if(typeof readOutput!=='function')fail();
 let started=false,observation=null;
 const initialize=scope=>{
  observation=null;if(started)throw new Error('proposal-business-already-executed');started=true;
  scope.proposalBusinessFacts={available:false,hold:false,uncertain:false,match:false,technicalSuccess:false,authorized:false};
 };
 const initial=start?start.addFunction('Observe reported proposal business outcome',initialize,'proposal-business-input'):
  flowChart('Observe reported proposal business outcome',initialize,'proposal-business-input');
 const chart=initial.addFunction('Read bounded named outcome and actual reported job conclusion',async scope=>{
  try{
   const data=fields(jsonData(await readOutput(),4096),['output','conclusion']);
   if(typeof data.output!=='string'||Buffer.byteLength(data.output)>1024||!conclusions.includes(data.conclusion))fail();
   const hold=data.output==='proposeOutcome=hold-metadata-stale\n',uncertain=data.output==='proposeOutcome=hold-proposal-uncertain\n',match=data.output==='proposeOutcome=metadata-matched\n';
   if(!hold&&!uncertain&&!match)fail();
   scope.proposalBusinessFacts={available:true,hold,uncertain,match,technicalSuccess:data.conclusion==='success',authorized:false};
  }catch{/* No raw output, source exception or private payload enters scope. */}
 },'proposal-business-read')
 .addDeciderFunction('Require explicit business match AND technical success',scope=>decide(scope,[
  {when:s=>s.proposalBusinessFacts.hold,then:'proposal-business-held',label:'Reported HOLD blocks continuation even after provider SUCCESS'},
  {when:s=>s.proposalBusinessFacts.uncertain,then:'proposal-business-uncertain',label:'Uncertain submission blocks continuation; output never grants retry'},
  {when:s=>s.proposalBusinessFacts.match&&s.proposalBusinessFacts.technicalSuccess,then:'proposal-business-matched',label:'Business predicate observed only; all native authority remains separate'},
  {when:s=>s.proposalBusinessFacts.available&&s.proposalBusinessFacts.match,then:'proposal-business-failed-job',label:'Never convert failed or running legacy job into success'}
 ],'proposal-business-unknown'),'proposal-business-decision')
 .addFunctionBranch('proposal-business-held','Retain metadata business HOLD',s=>{s.proposalBusinessDecision='held';})
 .addFunctionBranch('proposal-business-uncertain','Retain uncertain proposal business HOLD',s=>{s.proposalBusinessDecision='uncertain';})
 .addFunctionBranch('proposal-business-matched','Record reported business match',s=>{s.proposalBusinessDecision='matched';})
 .addFunctionBranch('proposal-business-failed-job','Retain unsuccessful provider job',s=>{s.proposalBusinessDecision='job-not-successful';})
 .addFunctionBranch('proposal-business-unknown','Unknown output blocks continuation',s=>{s.proposalBusinessDecision='unknown';}).setDefault('proposal-business-unknown').end()
 .addFunction('Record business predicate without release authority',scope=>{
  const reported={...reports[scope.proposalBusinessDecision],terminalAdmission:false,releaseReady:false,authorized:false};
  observation=Object.freeze({...reported,digest:createHash('sha256').update(JSON.stringify(reported)).digest('hex')});
  observations.add(observation);scope.proposalBusinessResult=observation;
 },'proposal-business-result');
 return Object.freeze({chart,resultStageId:'proposal-business-result',getObservation:()=>observation});
}
/** Negative eco projection only. A match never clears another finding/hold.
 * Runtime ownership does not authenticate a provider, source profile or process.
 * Saved/model JSON cannot substitute this collected diagnostic observation.
 */
export function proposalBusinessFindings(value){
 if(value===undefined)return {holds:[],findings:[],receiptRef:null};
 if(!observations.has(value))return {holds:[],findings:['proposal-outcome-unbound'],receiptRef:null};
 const rows={held:{holds:[value.finding],findings:[]},unknown:{holds:[],findings:[value.finding]},matched:{holds:[],findings:[]}};
 return {...rows[value.status],receiptRef:value.digest};
}
