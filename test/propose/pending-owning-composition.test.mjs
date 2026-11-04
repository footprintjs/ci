import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {createFoottraceMetadataWriterBootstrap} from '../../src/propose/proposal-bootstrap-flow.mjs';
import {appendFoottracePendingRefresh} from '../../src/propose/pending-refresh-flow.mjs';
const implementation=await import('../../src/propose/pending-successor-flow.mjs').catch(()=>({}));
async function compose({refresh=false,replaceCapture=false,missingRoot=false,...options}={}){
 const f=await refreshFixture(options),root=createFoottraceMetadataWriterBootstrap(f.makeInvocation());
 const captured=replaceCapture?createFoottraceMetadataWriterBootstrap(f.makeInvocation()).getInvocationInput():root.getInvocationInput();
 let executor,before=0;
 const completed=id=>{const s=executor.getSnapshot();return !(missingRoot&&id===root.resultStageId)&&
  executor.getCommitCount()===s.commitLog.length&&s.commitLog.some(r=>r.stageId===id);};
 const chart=root.chart.addFunction('Actual owning route prefix',()=>{before=f.calls.length;},'test-pending-owner-prefix');
 assert.equal(typeof implementation.appendFoottracePendingSuccessor,'function','SAME pending preparation chart cannot yet compose under an existing owner');
 const stage=implementation.appendFoottracePendingSuccessor({chart,captured,root,completed,execution:()=>executor,
  continuation:refresh?appendFoottracePendingRefresh:null});
 const built=stage.chart.addFunction('Actual pending owner terminal',scope=>{
  assert.equal(completed(stage.resultStageId),true);scope.pendingOwnerResult={status:stage.status(),authorized:false};
 },'test-pending-owner-terminal').build();
 executor=new FlowChartExecutor(built,{initialContext:{readOnly:false},commitValues:'delta',captureCoverage:true,readSources:true,writeProvenance:'reads-prefix'});
 let complete=false;try{await executor.run();complete=true;}catch{/* No completed branch from diagnostic DATA. */}
 return {f,root,stage,executor,complete,before};
}
for(const refresh of [false,true])test('pending '+(refresh?'ref/metadata':'objects only')+' route composes with ONE capture and owning executor',async()=>{
 const {f,stage,executor,complete}=await compose({refresh});
 assert.equal(complete,true);assert.equal(stage.status(),refresh?'metadata-reconciled':'successor-prepared');
 assert.equal(f.effects.length,5);assert.equal(f.refMoves.length,refresh?1:0);assert.equal(f.patches.length,refresh?1:0);
 assert.equal(stage.report().acknowledged,5);assert.equal(stage.report().authorized,false);assert.equal(stage.report().releaseReady,false);
 const ids=executor.getSnapshot().commitLog.map(x=>x.stageId);
 for(const id of ['proposal-bootstrap-capture','test-pending-owner-prefix','pending-successor-root-boundary','pending-successor-terminal','test-pending-owner-terminal'])
  assert.equal(ids.filter(x=>x===id).length,1,id);
});
test('pending route refuses a second captured client before any pending history reads',async()=>{
 const {f,stage,complete,before}=await compose({replaceCapture:true});
 assert.equal(complete,false);assert.equal(f.calls.length,before);assert.equal(f.effects.length,0);assert.equal(stage.report().attempted,0);
});
test('pending route requires actual source-prefix completion before history reads',async()=>{
 const {f,stage,complete,before}=await compose({missingRoot:true});
 assert.equal(complete,false);assert.equal(f.calls.length,before);assert.equal(f.effects.length,0);assert.equal(stage.report().attempted,0);
});
test('uncertain ref in the composed route never retries or enters metadata',async()=>{
 const {f,stage,complete}=await compose({refresh:true,refStatus:503});
 assert.equal(complete,true);assert.equal(stage.status(),'refresh-verify-only');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(stage.report().refOutcome,'uncertain');assert.equal(stage.report().refMoved,null);
});
