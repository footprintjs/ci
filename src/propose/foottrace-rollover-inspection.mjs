import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {flowChart,decide} from 'footprintjs';
import {createFoottraceOrdinaryReaders} from './rollover-inspection-readers.mjs';
import {createFoottraceRolloverTransitionObserver} from './rollover-post-ref.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireValid=value=>{if(value?.valid!==true)throw new Error('rollover-inspection-unavailable');return value;};
/** Ordinary closed-published INPUT composition only. SAME native source,
 * producer/archive and retained-history readers; L never becomes pending P.
 * One native chart records finite facts. No saved records, effects, writer
 * permission, erased history or provider continuity are admitted here.
 */
export function createFoottraceRolloverInspection({transport,context,artifactId}={},predecessor){
 let steps=null,readers=null;
 try{
  readers=createFoottraceOrdinaryReaders({transport,context,artifactId});
  const {source,current,archive,rollover,workflows,versions,assess,candidate}=readers;
  // Fixed trusted CODE recipes construct native stages; callers provide no
  // callbacks, descriptors, execution engine or observations.
  steps=[
   ['source',async b=>{b.source=requireValid(await source());b.prepared=b.source.prepared;return b.source;}],
   ['current',async b=>b.current=requireValid(await current(b.prepared))],
   ['archive',async b=>b.archive=requireValid(await archive(b.prepared,b.current))],
   ['rollover',async b=>b.rollover=requireValid(await rollover(b.prepared))],
   ['workflows',async b=>b.workflows=requireValid(await workflows())],
   ['versions',async b=>b.versions=requireValid(await versions(b.prepared,b.workflows))],
   ['attempts',async b=>{
    const ref=b.rollover.reference;
    b.attempts=requireValid(assess({prepared:b.prepared,collection:b.workflows,versions:b.versions,current:b.current,archive:b.archive,
     published:{predecessor:ref.predecessor,version:ref.fromVersion,tree:ref.predecessor.tree,
      archiveDigest:ref.publishedArchiveDigest,producer:ref.publishedProducer}}));
    if(b.attempts.eligible!==true)throw new Error('rollover-inspection-unavailable');return b.attempts;
   }],
   ['candidate',async b=>b.candidate=requireValid(await candidate(b.prepared))]
  ];
 }catch{/* Invalid constructor input yields only a finite native hold. */}
 let backend={},started=false,invalidated=false,available=false,busy=false;
 const signature=b=>({prepared:b.prepared,...Object.fromEntries(steps.map(([key])=>[key,b[key].digest]))});
 const reacquire=async()=>{
  const fresh={};for(const [,read] of steps)await read(fresh);
  return isDeepStrictEqual(signature(fresh),signature(backend));
 };
 const invalidate=()=>{invalidated=true;available=false;backend=null;};
 const reobserve=async()=>{
  if(!available||invalidated)return false;
  if(busy){invalidate();return false;}
  busy=true;
  try{
   if(!await reacquire()||invalidated||!available){invalidate();return false;}
   return true;
  }catch{invalidate();return false;}finally{busy=false;}
 };
 const initialize=scope=>{
  available=false;
  if(started){invalidate();throw new Error('rollover-inspection-already-executed');}
  started=true;
  scope.rolloverInspectionFacts={configured:steps!==null,source:false,current:false,archive:false,rollover:false,
   workflows:false,versions:false,attempts:false,candidate:false,fresh:false};
  scope.rolloverInspectionRefs=[];
 };
 let chart=predecessor?predecessor.addFunction('Begin ordinary native INPUT inspection',initialize,'rollover-inspection-start')
  :flowChart('Begin ordinary native INPUT inspection',initialize,'rollover-inspection-start');
 // Static construction: each acquisition is selected by native decide(), and
 // every refused dependency prevents all later acquisition stages.
 for(const [index,[key,read]] of (steps??[]).entries()){
  const prior=index===0?'configured':steps[index-1][0],yes='rollover-read-'+key,no='rollover-hold-'+key;
  chart=chart.addDeciderFunction('Ordinary '+key+' input prerequisites',scope=>decide(scope,[
   {when:s=>s.rolloverInspectionFacts[prior]===true,then:yes,label:'Read actual native '+key+' INPUT'}
  ],no),'rollover-decide-'+key)
  .addFunctionBranch(yes,'Acquire ordinary '+key+' facts',async scope=>{
   try{
    const value=await read(backend);
    if(invalidated)throw new Error();
    scope.rolloverInspectionFacts={...scope.rolloverInspectionFacts,[key]:true};
    scope.rolloverInspectionRefs=[...scope.rolloverInspectionRefs,{kind:key,receiptRef:value.digest}];
   }catch{/* No raw provider/error payload enters the native diagnostic scope. */}
  })
  .addFunctionBranch(no,'Ordinary '+key+' unavailable',()=>{}).setDefault(no).end();
 }
 chart=chart.addDeciderFunction('Complete ordinary INPUT closure observed',scope=>decide(scope,[
  {when:s=>s.rolloverInspectionFacts.candidate===true,then:'rollover-reacquire',label:'Reacquire complete native INPUT closure'}
 ],'rollover-hold-fresh'),'rollover-decide-fresh')
 .addFunctionBranch('rollover-reacquire','Reacquire ordinary source and native eligibility inputs',async scope=>{
  try{
   if(!await reacquire()||invalidated)return;
   available=true;scope.rolloverInspectionFacts={...scope.rolloverInspectionFacts,fresh:true};
  }catch{/* Current snapshots never establish lost history or effect authority. */}
 })
 .addFunctionBranch('rollover-hold-fresh','Ordinary fresh INPUT closure unavailable',()=>{}).setDefault('rollover-hold-fresh').end()
 .addFunction('Record ordinary native INPUT result',scope=>{
  if(invalidated)throw new Error('rollover-inspection-already-executed');
  if(!available)backend=null;
  scope.rolloverInspectionResult={available,authorized:false,executedWrites:0,writerCredentialBindingAdmitted:false,
   retainedEligibilityAdmitted:false,providerContinuityProved:false,erasedHistoryProved:false,
   count:scope.rolloverInspectionRefs.length,receiptRef:digest(scope.rolloverInspectionRefs)};
 },'rollover-inspection-result');
 return Object.freeze({chart,resultStageId:'rollover-inspection-result',reobserve,invalidate,
  getBackend:()=>available&&!invalidated?backend:null,
  createTransitionObserver:()=>{
   const baseline=available&&!invalidated?backend:null;
   if(baseline===null||readers===null||baseline.attempts?.eligible!==true)throw new Error('rollover-transition-inputs-unavailable');
   invalidate();
   return createFoottraceRolloverTransitionObserver({transport,context,baseline,readers});
  }});
}
