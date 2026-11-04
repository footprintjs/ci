import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {createFoottraceMetadataWriterBootstrap} from '../../src/propose/proposal-bootstrap-flow.mjs';
const implementation=await import('../../src/propose/metadata-c1-flow.mjs').catch(()=>({}));
function append(options){
 assert.equal(typeof implementation.appendFoottraceMetadataReconciliation,'function','SAME native C1 chart cannot yet compose under an existing source/writer owner');
 return implementation.appendFoottraceMetadataReconciliation(options);
}
async function compose({exact=false,missing=null,status=200,apply=true,replaceCapture=false}={}){
 const f=await metadataC1Fixture({exact,status,apply}),invocation=f.makeInvocation(),
  root=createFoottraceMetadataWriterBootstrap(invocation),captured=replaceCapture?createFoottraceMetadataWriterBootstrap(f.makeInvocation()).getInvocationInput():root.getInvocationInput();let executor,before=0;
 const completed=id=>{
  const s=executor.getSnapshot();return executor.getCommitCount()===s.commitLog.length&&id!==missing&&s.commitLog.some(r=>r.stageId===id);
 };
 const prefix=root.chart.addFunction('One owning route prefix',()=>{before=f.calls.length;},'test-owner-route-prefix');
 const stage=append({chart:prefix,captured,root,completed});
 const chart=stage.chart.addFunction('Owning continuation observes native C1 terminal',scope=>{
  assert.equal(completed(stage.resultStageId),true);scope.testRouteResult={outcome:stage.outcome(),authorized:false};
 },'test-owner-route-terminal').build();
 executor=new FlowChartExecutor(chart,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 let completedRun=false;try{await executor.run();completedRun=true;}catch{/* Actual incomplete native route remains incomplete. */}
 return {f,stage,executor,completedRun,before,captured,invocation};
}
for(const exact of [true,false])test('current C1 '+(exact?'no-op':'setter')+' appends to the SAME owner/chart/executor without another capture',async()=>{
 const {f,stage,executor,completedRun,invocation}=await compose({exact});
 assert.equal(completedRun,true);assert.equal(stage.outcome(),'metadata-match');assert.equal(f.patches.length,exact?0:1);
 const ids=executor.getSnapshot().commitLog.map(x=>x.stageId);
 for(const id of ['proposal-bootstrap-capture','test-owner-route-prefix','metadata-c1-root-boundary','metadata-c1-terminal','test-owner-route-terminal'])
  assert.equal(ids.filter(x=>x===id).length,1,id);
 assert.ok(ids.indexOf('test-owner-route-prefix')<ids.indexOf('metadata-c1-root-boundary'));
 assert.equal(invocation.env.GH_TOKEN,undefined);assert.equal(invocation.env.APP_IDENTITY_FACTS,undefined);
 assert.equal(stage.report().authorized,false);assert.equal(stage.report().releaseReady,false);
 assert.equal(JSON.stringify(executor.getSnapshot()).includes(PRIVATE),false);
});
test('the composed C1 stage refuses missing ACTUAL source-prefix completion before history reads',async()=>{
 const {f,stage,completedRun,before}=await compose({missing:'proposal-bootstrap-result'});
 assert.equal(completedRun,false);assert.equal(f.calls.length,before);assert.equal(f.patches.length,0);assert.equal(stage.outcome(),null);
});
test('the composed C1 stage refuses missing actual native pre-effect completion before mutation',async()=>{
 const {f,stage,completedRun}=await compose({missing:'metadata-c1-pre-effect'});
 assert.equal(completedRun,false);assert.equal(f.patches.length,0);assert.equal(stage.outcome(),null);
});
test('composed C1 uncertainty remains ONE setter and HOLD for this invocation',async()=>{
 const {f,stage,completedRun}=await compose({status:503,apply:false});
 assert.equal(completedRun,true);assert.equal(f.patches.length,1);assert.equal(stage.outcome(),'metadata-hold');
 assert.equal(stage.report().submission,'uncertain');assert.equal(stage.report().patchAttempts,1);
 assert.equal(stage.report().authorized,false);assert.equal(stage.report().releaseReady,false);
});
test('the composed route refuses a second captured client even with identical synthetic repository and source facts',async()=>{
 const {f,stage,completedRun,before}=await compose({replaceCapture:true});
 assert.equal(completedRun,false);assert.equal(f.calls.length,before);assert.equal(f.patches.length,0);
 assert.equal(stage.outcome(),null);
});
