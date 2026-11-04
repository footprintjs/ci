import test from 'node:test';
import assert from 'node:assert/strict';
import {bootstrapFixture} from './bootstrap-provider-fixture.mjs';
import {metadataInputFixture} from './metadata-input-provider-fixture.mjs';
import {proposalBootstrapFixture} from './proposal-bootstrap-provider-fixture.mjs';
import {createFoottraceMetadataWriterBootstrap} from '../../src/propose/proposal-bootstrap-flow.mjs';
import {createFoottraceInputBootstrap} from '../../src/propose/foottrace-input-bootstrap.mjs';
import {createFoottraceMetadataInputBootstrap} from '../../src/propose/foottrace-metadata-inputs.mjs';
import {createFoottraceMetadataHistoryInspection} from '../../src/propose/foottrace-metadata-history.mjs';
import {createFoottraceProposeInspection} from '../../src/propose/foottrace-inspection.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const cases=[
 ['writer root',proposalBootstrapFixture,f=>createFoottraceMetadataWriterBootstrap(f.makeInvocation()),'reobserve'],
 ['pending discovery',bootstrapFixture,f=>createFoottraceInputBootstrap({transport:f.transport,context:f.context}),'reobserve'],
 ['current metadata inputs',metadataInputFixture,f=>createFoottraceMetadataInputBootstrap({transport:f.transport,context:f.fullContext,artifactId:800}),'reobserve'],
 ['current metadata history',metadataInputFixture,f=>createFoottraceMetadataHistoryInspection({transport:f.transport,context:f.fullContext,artifactId:800}),'reobserve'],
 ['complete pending inspection',bootstrapFixture,f=>createFoottraceProposeInspection({transport:f.transport,context:f.fullContext,artifactId:800}),'reobserve'],
 ['pending effect anchors',bootstrapFixture,f=>createFoottraceProposeInspection({transport:f.transport,context:f.fullContext,artifactId:800}),'reobserveEffects']
];
/** Actual native input readers over synthetic providers only. The barrier is
 * on the FINAL provider response of the positive reader recipe, after all its
 * earlier guards. No writer authority, hosted producer or live effect proof.
 */
for(const [name,make,create,method] of cases)test(name+' final awaited observation cannot outlive sibling invalidation',async()=>{
 let measuring=false,measured=0;
 const control=await make({retainedJobs:'full-native',changeHttp:reply=>{if(measuring)measured++;return reply;}}),
  positive=create(control);
 assert.equal((await runNativeObservationRecord({chart:positive.chart})).record.complete,true);
 assert.notEqual(positive.getBackend(),null,'positive actual prefix bound');
 measuring=true;assert.equal(await positive[method](),true,'unchanged actual native recipe remains valid');
 assert.ok(measured>0,'measure actual final native response, never a timer or guessed ordinal');
 let armed=false,count=0,enter,release;
 const entered=new Promise(r=>{enter=r;}),barrier=new Promise(r=>{release=r;});
 const f=await make({retainedJobs:'full-native',changeHttp:reply=>{
  if(!armed)return reply;
  count++;
  if(count===measured){enter();return barrier.then(()=>reply);}
  if(count>measured)throw new Error('OFFLINE sibling acquisition unavailable');
  return reply;
 }}),stage=create(f);
 assert.equal((await runNativeObservationRecord({chart:stage.chart})).record.complete,true);
 assert.notEqual(stage.getBackend(),null);armed=true;
 const first=stage[method]();let second,failure;
 try{
  await Promise.race([entered,first.then(()=>assert.fail('first reader settled before final native-response barrier'))]);
  second=await stage[method]();
 }catch(error){failure=error;}finally{release();}
 const settled=await first;if(failure)throw failure;
 assert.equal(second,false,'sibling cannot complete native input observation');
 assert.equal(stage.getBackend(),null,'failed sibling permanently removes input backend');
 assert.equal(settled,false,'first cannot report fresh inputs after a sibling invalidates at its FINAL await');
 const stopped=count;assert.equal(await stage[method](),false);assert.equal(count,stopped,'no stale recovery read');
});
