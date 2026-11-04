import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverObjectFixture} from './rollover-object-provider-fixture.mjs';
import {createFoottraceRolloverInspection} from '../../src/propose/foottrace-rollover-inspection.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const stage=f=>createFoottraceRolloverInspection({transport:f.transport,context:f.fullContext,artifactId:800});
async function begin(f){
 const s=stage(f);assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);assert.notEqual(s.getBackend(),null);
 assert.equal(typeof s.createTransitionObserver,'function','ordinary native transition observer absent');
 const read=s.createTransitionObserver();assert.equal(s.getBackend(),null);assert.equal(await s.reobserve(),false);
 return {s,read};
}
// Synthetic post-ref world only. Choosing N is INPUT, never an ACK, saved grant
// or permission to create a PR; the owning native flow must prove that itself.
test('ordinary post-ref INPUT joins actual N/M/L and complete native eligibility without an invented P or ACK',async()=>{
 const f=await rolloverObjectFixture(),{read}=await begin(f);f.f.tip=f.objectHead;
 const v=await read({head:f.objectHead});assert.equal(v.valid,true);assert.equal(v.scope,'ordinary-post-ref-inputs-only');
 assert.equal(v.reference.head,f.objectHead);assert.deepEqual(v.reference.parents,[f.M,f.f.originalHead]);assert.equal(v.reference.publishedHead,f.f.originalHead);
 assert.equal(v.authorized,false);assert.equal(v.submissionAcknowledged,false);assert.equal(v.writerCredentialBindingAdmitted,false);
 assert.equal(v.originalProducerAttributed,false);assert.equal(Object.hasOwn(v.reference,'pendingSha'),false);
});
for(const kind of ['wrong-ref','ordered-parents','open-pr','published-attempt','expired-archive','candidate-reservation'])test('ordinary transition refuses '+kind,async()=>{
 const f=await rolloverObjectFixture({edit:d=>{if(kind==='ordered-parents')d.parents.reverse();}}),{read}=await begin(f);
 if(kind!=='wrong-ref')f.f.tip=f.objectHead;
 if(kind==='open-pr'){const p=structuredClone(f.pending);p.state='open';p.head.sha=f.P;f.f.pulls.push(p);}
 if(kind==='published-attempt'){const a=[...f.f.releases.values()][0].assets[0],m=JSON.parse(a.raw);m.runAttempt=2;a.raw=Buffer.from(JSON.stringify(m));}
 if(kind==='expired-archive')f.cohorts.find(c=>c.artifact?.id===800).artifact.expired=true;
 if(kind==='candidate-reservation')[...f.f.releases.values()][0].assets.push({id:99881,name:'publish-attempt-'+f.prepared.version+'.json',state:'uploaded',size:12});
 assert.equal((await read({head:f.objectHead})).valid,false);
 const stopped=f.calls.length;assert.equal((await read({head:f.objectHead})).valid,false);assert.equal(f.calls.length,stopped);
});
test('ordinary transition cannot be minted from a factory whose native prefix never completed',async()=>{
 const f=await rolloverObjectFixture(),s=stage(f);
 assert.equal(typeof s.createTransitionObserver,'function','ordinary native transition observer absent');
 const before=f.calls.length;assert.throws(()=>s.createTransitionObserver());assert.equal(f.calls.length,before);
});
test('ordinary transition FINAL awaited response cannot outlive permanent sibling invalidation',async()=>{
 let measuring=false,measured=0;
 const control=await rolloverObjectFixture({changeHttp:r=>{if(measuring)measured++;return r;}}),positive=await begin(control);control.f.tip=control.objectHead;
 measuring=true;assert.equal((await positive.read({head:control.objectHead})).valid,true);assert.ok(measured>0);
 let armed=false,count=0,enter,release;const entered=new Promise(r=>{enter=r;}),barrier=new Promise(r=>{release=r;});
 const f=await rolloverObjectFixture({changeHttp:r=>{if(armed&&++count===measured){enter();return barrier.then(()=>r);}return r;}});
 const {read}=await begin(f);f.f.tip=f.objectHead;armed=true;const first=read({head:f.objectHead});let second;
 try{await Promise.race([entered,first.then(()=>assert.fail('first completed before final native response'))]);second=await read({head:f.objectHead});}finally{release();}
 assert.equal(second.valid,false);assert.equal((await first).valid,false);
 const stopped=count;assert.equal((await read({head:f.objectHead})).valid,false);assert.equal(count,stopped);
});
