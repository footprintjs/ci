import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
import {createFoottraceMetadataHistoryInspection} from '../../src/propose/foottrace-metadata-history.mjs';
async function fixture(options={}){
 const f=await metadataInputFixture({retainedJobs:'full-native',...options});
 const stage=createFoottraceMetadataHistoryInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 assert.equal(typeof stage.reobserve,'function','the owning C1 flow cannot reacquire complete native history through the SAME captured owner');
 return {f,stage,executor:new FlowChartExecutor(stage.chart.build())};
}
test('native history is unavailable before its real execution and can be freshly reacquired afterward',async()=>{
 const {f,stage,executor}=await fixture();
 assert.equal(await stage.reobserve(),false);assert.equal(f.calls.length,0);
 await executor.run();assert.ok(stage.getBackend());
 const calls=f.calls.length;assert.equal(await stage.reobserve(),true);assert.ok(f.calls.length>calls);
 assert.equal(stage.getBackend().authorized,undefined);
});
test('later retained-job drift invalidates the previously completed history and cannot recover a stale backend',async()=>{
 let drift=false;
 const {stage,executor}=await fixture({change:(d,p)=>{
  if(drift&&p.includes('/runs/456/')&&d.jobs)d.jobs.find(j=>j.name==='plan').conclusion='neutral';
 }});
 await executor.run();assert.ok(stage.getBackend());drift=true;
 assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);
 drift=false;assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);
});
test('later metadata drift cannot borrow a previously completed native history',async()=>{
 let drift=false;
 const {stage,executor}=await fixture({changeMetadata:d=>{if(drift)d.body+='changed';}});
 await executor.run();assert.ok(stage.getBackend());drift=true;
 assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);
});
test('later authorization/acquisition failure is unavailable with no private error or saved authority',async()=>{
 let drift=false;
 const {stage,executor}=await fixture({change:(d,p)=>{
  if(drift&&p.includes('/actions/workflows/11/runs'))throw Error(PRIVATE);
 }});
 await executor.run();assert.ok(stage.getBackend());drift=true;
 assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);
});
test('later actual current-run completion refuses a fresh history observation instead of reusing earlier running facts',async()=>{
 let drift=false;
 const {stage,executor}=await fixture({change:(d,p)=>{
  if(drift&&p.endsWith('/runs/500/attempts/1')){d.status='completed';d.conclusion='success';}
 }});
 await executor.run();assert.ok(stage.getBackend());drift=true;
 assert.equal(await stage.reobserve(),false);assert.equal(stage.getBackend(),null);
});
