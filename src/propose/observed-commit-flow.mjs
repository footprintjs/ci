import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {flowChart,decide} from 'footprintjs';
import {runNativeObservationRecord} from './native-observation-record.mjs';
import {fields,jsonData,id,text,array} from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import {own,keys} from './source-inventory.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=()=>{throw new Error('observed-app-commit-unavailable');};
const sha=v=>{if(!control.validSha(v))fail();return v;};
function bind(value,prepared,pending,current) {
 if(own(value,'valid')!==true||own(value,'scope')!=='observed-app-commit-only'||own(value,'authorized')!==false||
  own(value,'writerCredentialBindingAdmitted')!==false||own(value,'retainedEligibilityAdmitted')!==false||
  own(value,'originalProducerAttributed')!==false||own(value,'currentIdentityReferenceBound')!==true||own(value,'adjacentSnapshotOnly')!==true)fail();
 const ref=fields(jsonData(own(value,'reference')),['repositoryId','sourceSha','sourceTree','pr','head','tree','parents',
  'appId','botId','botLogin','verified','reason','currentIdentityDigest']);
 for(const k of ['repositoryId','pr','appId','botId'])id(ref[k]);
 for(const k of ['sourceSha','sourceTree','head','tree'])sha(ref[k]);
 array(ref.parents,2);if(!ref.parents.length)fail();for(const p of ref.parents)sha(p);
 text(ref.botLogin,/^[a-z0-9-]+\[bot\]$/,105);text(ref.currentIdentityDigest,/^[a-f0-9]{64}$/,64);
 const p=own(pending,'reference'),identity=own(current,'identity');
 if(ref.sourceSha!==own(prepared,'sourceSha')||ref.sourceTree!==own(prepared,'sourceTree')||
  ref.head!==own(p,'head')||ref.tree!==own(p,'tree')||ref.pr!==own(p,'pr')||ref.botId!==own(p,'botId')||
  !isDeepStrictEqual(ref.parents,own(p,'parents'))||ref.repositoryId!==own(identity,'repositoryId')||
  ref.appId!==own(identity,'appId')||ref.botId!==own(identity,'botId')||ref.currentIdentityDigest!==own(current,'digest')||
  ref.verified!==true||ref.reason!=='valid'||own(value,'digest')!==digest(ref)||
  typeof own(value,'sameTargetTree')!=='boolean'||own(value,'sameTargetTree')!==(ref.tree===own(prepared,'targetTree')))fail();
 return Object.freeze({reference:ref,digest:digest(ref),sameTargetTree:own(value,'sameTargetTree')});
}
/** Extendable native knowledge stage, never an approval/effect stage.
 * The final Propose recipe can append this chart to its other native decisions.
 * A standalone run is available for component recording proof, not publication.
 */
export function createObservedAppCommitInspection({readCommit,readInputs,start}={}) {
 let backend=null;
 const inspect=async scope=>{
  scope.proposeObservedFacts={known:false,sameTargetTree:false,authorized:false,executedWrites:0,originalProducerAttributed:false,reason:'observed-app-commit-unavailable'};
  scope.proposeObservedRefs=[];
  try{
   if(typeof readCommit!=='function'||typeof readInputs!=='function')fail();
   const inputs=readInputs();keys(inputs,['prepared','pending','current']);
   const prepared=own(inputs,'prepared'),pending=own(inputs,'pending'),current=own(inputs,'current');
   const value=await readCommit(prepared,pending,current);
   if(['metadata-pending-observation-drift','metadata-review-observation-drift','effective-approval','effective-refusal','pending-review','review-evidence-unavailable'].includes(own(value,'reason')))
    scope.proposeObservedFacts={...scope.proposeObservedFacts,reason:own(value,'reason')};
   backend=bind(value,prepared,pending,current);
   scope.proposeObservedRefs=[{kind:'observed-app-commit',receiptRef:backend.digest,sourceSha:backend.reference.sourceSha,headSha:backend.reference.head,pr:backend.reference.pr}];
   scope.proposeObservedFacts={...scope.proposeObservedFacts,known:true,sameTargetTree:backend.sameTargetTree};
  }catch{backend=null;}
 };
 const chart=(start?start.addFunction('Read current signed configured-App commit',inspect,'propose-observed-app-commit'):
  flowChart('Read current signed configured-App commit',inspect,'propose-observed-app-commit'))
 .addDeciderFunction('Observed commit input knowledge',scope=>decide(scope,[
  {when:s=>s.proposeObservedFacts.known===true,then:'observed-app-commit-known',label:'Signed configured App facts only; current effect eligibility remains separate'}
 ],'observed-app-commit-held'),'propose-observed-app-commit-decision')
 .addFunctionBranch('observed-app-commit-known','Observed commit bound',scope=>{scope.proposeObservedOutcome='observed-only';})
 .addFunctionBranch('observed-app-commit-held','Observed commit unavailable',scope=>{scope.proposeObservedOutcome='held';})
 .setDefault('observed-app-commit-held').end()
 .addFunction('Record observed commit result',scope=>{
  scope.proposeObservedResult={outcome:scope.proposeObservedOutcome,
   reason:scope.proposeObservedFacts.known?'observed-app-commit-bound':scope.proposeObservedFacts.reason,
   facts:{...scope.proposeObservedFacts,count:scope.proposeObservedRefs.length}};
 },'propose-observed-app-commit-result');
 return {chart,getBackend:()=>backend};
}
export async function runObservedAppCommitInspection({recordLimitBytes,...options}={}) {
 const stage=createObservedAppCommitInspection(options);
 const {record,snapshot}=await runNativeObservationRecord({chart:stage.chart,recordLimitBytes});
 const known=record.complete&&snapshot?.sharedState?.proposeObservedResult?.facts?.known===true;
 return {status:!record.complete?'incomplete':known?'observed-commit-only':'held',record,
  report:{authorized:false,executedWrites:0,originalProducerAttributed:false,sameTargetTree:known&&stage.getBackend()?.sameTargetTree===true},
  backend:known?stage.getBackend():null};
}
