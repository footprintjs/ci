import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {controlDepRecorder} from 'footprintjs/trace';
import {captureRecord} from '../../src/record.mjs';
import {containsRecordText} from './record-text-fixture.mjs';
import {metadataInputFixture} from './metadata-input-provider-fixture.mjs';
const module=await import('../../src/propose/foottrace-metadata-history.mjs');
function create(f,extra={}){
 assert.equal(typeof module.createFoottraceMetadataHistoryInspection,'function','native history prefix has no composable factory');
 return module.createFoottraceMetadataHistoryInspection({transport:f.transport,context:f.fullContext,artifactId:800,...extra});
}
function executor(chart){
 const value=new FlowChartExecutor(chart,{initialContext:{readOnly:true},commitValues:'delta',captureCoverage:true});
 value.attachFlowRecorder(controlDepRecorder({id:'control',captureCoverage:true}));return value;
}
test('actual native history prefix composes into ONE executor with a completed input-result boundary before its tail',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),prefix=create(f);let native;
 assert.equal(prefix.getBackend(),null);assert.equal(f.calls.length,0);
 const chart=prefix.chart.addFunction('Observe committed metadata prefix input only',scope=>{
  const snapshot=native.getSnapshot();assert.equal(native.getCommitCount(),snapshot.commitLog.length);
  assert.ok(snapshot.commitLog.some(row=>row.stageId===prefix.resultStageId));
  assert.equal(snapshot.commitLog.some(row=>row.stageId==='metadata-composition-tail'),false);
  const b=prefix.getBackend();assert.equal(b.metadata.observation.matches,true);
  scope.composedMetadataInput={known:true,authorized:false,executedWrites:0};
 },'metadata-composition-tail').build();
 native=executor(chart);await assert.doesNotReject(()=>native.run());
 const record=captureRecord({snapshot:native.getSnapshot(),structure:chart.buildTimeStructure,completed:true});
 assert.equal(record.complete,true);const reopened=JSON.parse(JSON.stringify(record));
 assert.equal(reopened.snapshot.sharedState.composedMetadataInput.known,true);
 assert.equal(containsRecordText(reopened,prefix.getBackend().metadata.payload.body),false);
 assert.equal(reopened.snapshot.commitLog.filter(row=>row.stageId==='metadata-current-inputs').length,1);
 assert.equal(reopened.snapshot.commitLog.filter(row=>row.stageId==='metadata-history-result').length,1);
 assert.equal(prefix.getBackend().metadata.authorized,false);
});
test('held native input prefix reaches its composed tail with no borrowed backend or effect authority',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native',metadata:{title:null,body:'unknown'}}),prefix=create(f);
 const chart=prefix.chart.addFunction('Observe held input',scope=>{
  assert.equal(prefix.getBackend(),null);scope.composedMetadataInput={known:false,authorized:false};
 },'metadata-composition-held-tail').build(),native=executor(chart);
 await assert.doesNotReject(()=>native.run());assert.equal(native.getSnapshot().sharedState.composedMetadataInput.known,false);
});
test('the same factory cannot replay its captured invocation or retain a previous backend on a second execution',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),prefix=create(f),chart=prefix.chart.build();
 const first=executor(chart);await first.run();assert.ok(prefix.getBackend());
 const count=f.calls.length,second=executor(chart);await assert.rejects(()=>second.run());
 assert.equal(f.calls.length,count);assert.equal(prefix.getBackend(),null);
 assert.equal(first.getSnapshot().sharedState.metadataHistoryResult.fresh,true);
});
test('a serialized transport label cannot supply a composed history runtime root',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'}),prefix=create(f,{transport:{scope:'captured-native-http-owner'}});
 const native=executor(prefix.chart.build());await native.run();assert.equal(prefix.getBackend(),null);
 assert.equal(f.calls.length,0);assert.equal(native.getSnapshot().sharedState.metadataHistoryResult.authorized,false);
});

test('the standalone production facade ignores DATA start fields rather than invoking a caller-selected chart',async()=>{
 const f=await metadataInputFixture({retainedJobs:'full-native'});let accessed=0;
 const start={get addFunction(){accessed++;throw new Error('PRIVATE-DATA-HOOK');}};
 const options={transport:f.transport,context:f.fullContext,artifactId:800,start};
 let r;await assert.doesNotReject(async()=>{r=await module.runFoottraceMetadataHistoryInspection(options);});
 assert.equal(r.status,'metadata-history-only');assert.equal(accessed,0);assert.equal(r.report.authorized,false);
});
