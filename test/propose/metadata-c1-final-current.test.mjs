import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {createFoottraceMetadataWriterBootstrap} from '../../src/propose/proposal-bootstrap-flow.mjs';
import {appendFoottraceMetadataReconciliation} from '../../src/propose/metadata-c1-flow.mjs';

/** Actual native C1 composition over synthetic provider state only. The
 * positive invocation measures its final pre-effect metadata acquisition.
 * A fresh invocation changes actual fixture job state or provider permission
 * during that final GET. No timer, guessed ordinal, new port or live effect.
 */
async function scenario({exact,kind=null,lastGet=null}){
 let f,executor,armed=false,recording=false,flipped=false,writerAllowed=true,sourceAvailable=true;
 const trace=[];
 f=await metadataC1Fixture({exact,
  changeSource(value){
   if(!sourceAvailable)value.files.entry=Buffer.from('Synthetic current host source changed after last metadata GET.\n');
  },
  change(data,route){
   if(new URL('https://api.github.com'+route).pathname==='/repos/footprintjs/foottrace')
    data.permissions.push=writerAllowed;
  },
  readChange(path){
   if(!recording)return;
   trace.push(path);
   if(kind===null||trace.length!==lastGet)return;
   assert.equal(flipped,false,'the final acquisition changes provider state once');
   flipped=true;
   if(kind==='job'){
    const current=f.cohorts.find(value=>value.run.id===f.fullContext.runId);
    const proposal=current.jobs.find(value=>value.name==='proposal');
    assert.equal(proposal.status,'in_progress');assert.equal(proposal.conclusion,null);
    proposal.status='completed';proposal.conclusion='success';
   }else if(kind==='writer'){
    assert.equal(writerAllowed,true);writerAllowed=false;
   }else{
    assert.equal(kind,'source');assert.equal(sourceAvailable,true);sourceAvailable=false;
   }
  }
 });
 const invocation=f.makeInvocation(),fetcher=invocation.fetcher;
 invocation.fetcher=async(url,request)=>{
  if(request.method==='PATCH')recording=false;
  return fetcher(url,request);
 };
 const nativeRoot=createFoottraceMetadataWriterBootstrap(invocation);let ownerRechecks=0;
 // Decorate ONLY trace collection around the SAME actual native owner. Every
 // native call executes and returns its real result; no permission is mocked.
 // Reacquire's two existing owner observations bracket history and checks.
 // The following metadata acquisition ends BEFORE any new final owner check,
 // so adding the required tail check never moves this regression's boundary.
 const root=Object.freeze({...nativeRoot,reobserve:async()=>{
  if(!armed)return nativeRoot.reobserve();
  const phase=++ownerRechecks;recording=false;
  const result=await nativeRoot.reobserve();
  if(phase===2)recording=true;
  return result;
 }});

 const completed=id=>{
  const snapshot=executor.getSnapshot(),done=executor.getCommitCount()===snapshot.commitLog.length&&
   snapshot.commitLog.some(value=>value.stageId===id);
  if(done&&id==='metadata-c1-pre-effect'&&!armed){armed=true;}
  return done;
 };
 const stage=appendFoottraceMetadataReconciliation({chart:root.chart,
  captured:root.getInvocationInput(),root,completed});
 executor=new FlowChartExecutor(stage.chart.build(),{initialContext:{readOnly:false},
  commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 let finished=false;try{await executor.run();finished=true;}catch{/* Native technical refusal remains incomplete. */}
 return {f,root,stage,executor,finished,armed,flipped,trace,writerAllowed,sourceAvailable,ownerRechecks};
}
for(const exact of [false,true])for(const kind of ['job','writer','source']){
 test('native C1 '+(exact?'no-op':'PATCH')+' refuses '+kind+' eligibility lost during final metadata acquisition',async()=>{
  const positive=await scenario({exact});
  assert.equal(positive.finished,true,'actual unchanged owning C1 composition is valid');
  assert.equal(positive.stage.outcome(),'metadata-match');
  assert.equal(positive.f.patches.length,exact?0:1);
  assert.equal(positive.armed,true);assert.ok(positive.ownerRechecks>=2);assert.ok(positive.trace.length>0);
  const attack=await scenario({exact,kind,lastGet:positive.trace.length});
  assert.equal(attack.armed,true);assert.equal(attack.flipped,true,'reach the measured FINAL metadata GET');
  assert.deepEqual(attack.trace.slice(0,positive.trace.length),positive.trace,'same native acquisition before its tail changes');
  if(kind==='job'){
   const current=attack.f.cohorts.find(value=>value.run.id===attack.f.fullContext.runId);
   assert.equal(current.jobs.find(value=>value.name==='proposal').status,'completed');
  }else if(kind==='writer')assert.equal(attack.writerAllowed,false);
  else assert.equal(attack.sourceAvailable,false);
  assert.equal(attack.f.patches.length,0,'no PATCH after current producer/writer eligibility is lost');
  assert.equal(attack.finished,false,'no successful C1 no-op or terminal after current eligibility is lost');
  assert.equal(attack.stage.outcome(),null);assert.equal(attack.stage.report().patchAttempts,0);
  assert.equal(attack.stage.report().authorized,false);assert.equal(attack.stage.report().releaseReady,false);
  assert.equal(JSON.stringify(attack.executor.getSnapshot()).includes(PRIVATE),false);
 });
}
