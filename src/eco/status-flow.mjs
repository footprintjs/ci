import {createHash} from 'node:crypto';
import {flowChart,FlowChartExecutor,decide} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {sliceForKey,keysReadFromExecutionTree,formatSlice} from 'foottrace';
import {captureRecord} from '../record.mjs';
import {collectSnapshot,collectPriorPolicy,collectLedgerState} from './collector.mjs';
import {createEcoReader,isEcoReader} from './github-reader.mjs';
import {statusFindings} from './status-findings.mjs';
import {jsonData} from './json-data.mjs';
const STAGES=['observe','admit','diff','report'];
const knownPolicyCodes=new Set(['policy-unanchored','policy-stale','policy-repository-missing']);
/** Observe/admit/diff/report only. No writer/effect port, restoration, execution
 * replay, arbitrary producer transcript or automatic retry exists in this API.
 * Raw replies, comments, gate names and anchors stay in backend closures.
 */
export async function runEcoStatus({target,anchor=null,reader=createEcoReader(),recordLimitBytes}={}){
 let snapshot=null,context=null,ledger=null,admissionCode=anchor===null?'policy-unanchored':'policy-unavailable',builder;
 const functions={
  observe:async scope=>{
   let facts;try{
    snapshot=await collectSnapshot({reader,target});
    facts=jsonData({available:true,...snapshot.facts,receiptDigest:snapshot.receipt.digest});
   }catch{facts={available:false,historyComplete:false};}
   // Preserve the external handoff boundary, including failed HTTP/size reads,
   // before SDK capture. Payload bytes/bodies/token/error text never enter scope.
   scope.observeReceipt=snapshot?jsonData(snapshot.receipt.state):null;
   scope.observeSources=isEcoReader(reader)?jsonData({responses:reader.observations(),totals:reader.totals()}):{responses:[],totals:{requests:0,bytes:0,omittedObservations:0}};
   scope.observeFacts=jsonData({...facts,...(snapshot?{receiptDigest:createHash('sha256').update(JSON.stringify(scope.observeReceipt)).digest('hex')}:{}),sourcesDigest:createHash('sha256').update(JSON.stringify(scope.observeSources)).digest('hex')});
  },
  admit:async scope=>{
   // This branch's facts are recorded by the preceding observation decide node.
   if(scope.observeFacts.available){
    try{context=await collectPriorPolicy({reader,anchor,snapshot});admissionCode='policy-bound';try{ledger=await collectLedgerState({reader,snapshot,context});}catch{admissionCode='ledger-unavailable';}}
    catch(error){admissionCode=knownPolicyCodes.has(error?.code)?error.code:'policy-unavailable';}
   }
   scope.admitSources=isEcoReader(reader)?jsonData({responses:reader.observations(),totals:reader.totals()}):{responses:[],totals:{requests:0,bytes:0,omittedObservations:0}};
   const sourcesDigest=createHash('sha256').update(JSON.stringify(scope.admitSources)).digest('hex');
   scope.admitFacts=context?{bound:true,sourcesDigest,ledgerBound:ledger!==null,reason:admissionCode,versionsCount:ledger?.versions.items.length??0,workCount:ledger?.work.items.length??0,ownerId:context.policy.ownerId,commit:context.observation.commit,digest:context.anchor.bodySha256}:{bound:false,sourcesDigest,reason:admissionCode};
  },
  diff:scope=>{
   // Read the recorded preceding boundaries as actual native dependencies.
   const observed=scope.observeFacts.available,bound=scope.admitFacts.bound;
   scope.diffFacts=statusFindings(observed?snapshot:null,bound?context:null,scope.admitFacts.reason,ledger);
  },
  report:scope=>{
   const facts=scope.diffFacts;
   scope.reportFacts=jsonData({status:scope.diffDecision,findings:[...facts.holds,...facts.findings],readOnly:true,authorized:false,executedWrites:0,observationAvailable:scope.observeFacts.available,policyBound:scope.admitFacts.bound});
  },
 };
 const decision=stage=>scope=>decide(scope,[
  {when:s=>stage==='diff'?s.diffFacts.holds.length>0:stage==='report'?s.reportFacts.status==='held':false,then:stage+'-held',label:'Retain observed hold; no effects'},
  {when:s=>stage==='observe'?s.observeFacts.available:stage==='admit'?s.admitFacts.bound&&s.admitFacts.ledgerBound:stage==='diff'?s.diffFacts.findings.length===0:s.reportFacts.status==='known',then:stage+'-known',label:'Record the bounded known facts only'},
 ],stage+'-unknown');
 for(const stage of STAGES){
  builder=builder?builder.addFunction(stage,functions[stage],stage):flowChart(stage,functions[stage],stage);
  builder=builder.addDeciderFunction(stage+' decision',decision(stage),stage+'-decision')
   .addFunctionBranch(stage+'-held',stage+' held',scope=>{scope[stage+'Decision']='held';})
   .addFunctionBranch(stage+'-known',stage+' known',scope=>{scope[stage+'Decision']='known';})
   .addFunctionBranch(stage+'-unknown',stage+' unknown',scope=>{scope[stage+'Decision']='unknown';})
   .setDefault(stage+'-unknown').end();
 }
 const chart=builder.build(),executor=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 executor.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));
 let completed=false;try{await executor.run();completed=true;}catch{}
 const native=completed?executor.getSnapshot():undefined;
 const saved=captureRecord({snapshot:native,structure:chart.buildTimeStructure,completed,recordLimitBytes,reason:'NATIVE_FAILURE'});
 const record={...saved,format:'eco-status-native-v1'};
 const report=native?.sharedState?.reportFacts??{status:'unknown',findings:['native-failure'],readOnly:true,authorized:false,executedWrites:0};
 return {status:record.complete?report.status:'incomplete',report,record};
}
/** Saved native Foottrace navigation only, never execution or fresh authority. */
export function explainEcoRecord(record,key){
 if(!record?.complete||record.format!=='eco-status-native-v1'||!record.snapshot)return 'Incomplete native eco evidence.';
 if(typeof key!=='string'||!/^(?:(?:observe|admit|diff|report)(?:Facts|Decision|Sources)|observeReceipt)$/.test(key))return 'Unsupported eco evidence key.';
 try{const {commitLog,executionTree}=record.snapshot;return formatSlice(sliceForKey(commitLog,key,keysReadFromExecutionTree(executionTree)));}
 catch{return 'Unreadable native eco evidence.';}
}
