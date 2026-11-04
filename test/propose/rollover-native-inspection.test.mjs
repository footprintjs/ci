import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverFixture} from './rollover-provider-fixture.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const implementation=await import('../../src/propose/foottrace-rollover-inspection.mjs').catch(()=>({}));
const stage=f=>{
 assert.equal(typeof implementation.createFoottraceRolloverInspection,'function','ordinary native retained eligibility inspection absent');
 return implementation.createFoottraceRolloverInspection({transport:f.transport,context:f.fullContext,artifactId:800});
};
async function observe(f){const s=stage(f),r=await runNativeObservationRecord({chart:s.chart});return {s,r};}
test('ordinary native input joins actual current producer/archive and SAME retained source/version/candidate engines',async()=>{
 const f=await rolloverFixture(),{s,r}=await observe(f),b=s.getBackend();
 assert.equal(r.record.complete,true);assert.notEqual(b,null);assert.equal(b.attempts.eligible,true);
 assert.equal(b.current.identity.runId,500);assert.equal(b.archive.reference.artifactId,800);
 assert.equal(b.rollover.reference.predecessor.head,f.f.originalHead);assert.equal(Object.hasOwn(b.prepared,'pendingSha'),false);
 assert.equal(r.snapshot.sharedState.rolloverInspectionResult.available,true);
 assert.equal(r.snapshot.sharedState.rolloverInspectionResult.authorized,false);
 assert.equal(f.f.calls.filter(x=>x.method!=='GET').length,0);
});
for(const kind of ['current-producer','current-archive','candidate-reservation','published-producer-attempt'])test('ordinary native eligibility refuses '+kind,async()=>{
 let f;f=await rolloverFixture({change:(d,p)=>{
  if(kind==='candidate-reservation'&&p.includes('/assets?'))d.push({id:76789,name:'publish-attempt-'+f.prepared.version+'.json',state:'uploaded',size:12});
 }});
 if(kind==='current-producer'){const c=f.cohorts.find(x=>x.run.id===500);c.run.status='completed';c.run.conclusion='success';}
 if(kind==='current-archive')f.cohorts.find(x=>x.artifact?.id===800).artifact.expired=true;
 if(kind==='published-producer-attempt'){
  const a=[...f.f.releases.values()][0].assets[0],m=JSON.parse(a.raw);m.runAttempt=2;a.raw=Buffer.from(JSON.stringify(m));
 }
 const {s,r}=await observe(f);assert.equal(r.record.complete,true);assert.equal(s.getBackend(),null);
 assert.equal(r.snapshot.sharedState.rolloverInspectionResult.available,false);
 assert.equal(f.f.calls.filter(x=>x.method!=='GET').length,0);
});
test('ordinary inspection unavailable before actual native execution does no acquisition',async()=>{
 const f=await rolloverFixture(),s=stage(f),before=f.calls.length;
 assert.equal(await s.reobserve(),false);assert.equal(s.getBackend(),null);assert.equal(f.calls.length,before);
});
test('later current native completion permanently invalidates ordinary eligibility INPUT facts',async()=>{
 const f=await rolloverFixture(),{s,r}=await observe(f);assert.equal(r.record.complete,true);assert.notEqual(s.getBackend(),null);
 const c=f.cohorts.find(x=>x.run.id===500);c.run.status='completed';c.run.conclusion='success';
 assert.equal(await s.reobserve(),false);assert.equal(s.getBackend(),null);
 const before=f.calls.length;assert.equal(await s.reobserve(),false);assert.equal(f.calls.length,before);
});
test('one ordinary inspection factory cannot be re-executed to recover old native input facts',async()=>{
 const f=await rolloverFixture(),{s,r}=await observe(f);assert.equal(r.record.complete,true);assert.notEqual(s.getBackend(),null);
 const before=f.calls.length,second=await runNativeObservationRecord({chart:s.chart});
 assert.equal(second.record.complete,false);assert.equal(s.getBackend(),null);assert.equal(f.calls.length,before);
});

test('fresh complete ordinary native observation rejects changed candidate collection even without a reservation',async()=>{
 let later=false;
 const f=await rolloverFixture({change:(d,p)=>{if(later&&p.includes('/assets?')&&!d.some(row=>row.id===87645))d.push({id:87645,name:'unrelated-diagnostic.json',state:'uploaded',size:5});}});
 const {s,r}=await observe(f);assert.equal(r.record.complete,true);assert.notEqual(s.getBackend(),null);
 later=true;assert.equal(await s.reobserve(),false);assert.equal(s.getBackend(),null);
});
test('ordinary native result keeps private scope and payloads out of the diagnostic record',async()=>{
 const f=await rolloverFixture(),{r}=await observe(f);
 assert.equal(r.record.complete,true);
 const data=JSON.stringify(r.record);
 for(const value of ['offline_registry_token','PRIVATE-HOST-SOURCE-AND-ENV','proposal.json','APP_PRIVATE_KEY'])assert.equal(data.includes(value),false);
});
test('ordinary final native response cannot restore INPUT after concurrent invalidation',async()=>{
 let measuring=false,measured=0;
 const control=await rolloverFixture({changeHttp:reply=>{if(measuring)measured++;return reply;}});
 const positive=stage(control);assert.equal((await runNativeObservationRecord({chart:positive.chart})).record.complete,true);
 measuring=true;assert.equal(await positive.reobserve(),true);assert.ok(measured>0);
 let armed=false,count=0,enter,release;
 const entered=new Promise(r=>{enter=r;}),barrier=new Promise(r=>{release=r;});
 const f=await rolloverFixture({changeHttp:reply=>{
  if(!armed)return reply;
  if(++count===measured){enter();return barrier.then(()=>reply);}return reply;
 }}),s=stage(f);
 assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);assert.notEqual(s.getBackend(),null);
 armed=true;const first=s.reobserve();let second;
 try{await Promise.race([entered,first.then(()=>assert.fail('first completed before final native response'))]);second=await s.reobserve();}
 finally{release();}
 assert.equal(second,false);assert.equal(await first,false);assert.equal(s.getBackend(),null);
 const stopped=count;assert.equal(await s.reobserve(),false);assert.equal(count,stopped);
});
test('ordinary repeated native execution cannot restore a suspended first INPUT acquisition',async()=>{
 let armed=false,enter,release;
 const entered=new Promise(r=>{enter=r;}),barrier=new Promise(r=>{release=r;});
 const f=await rolloverFixture({changeHttp:reply=>{if(armed){armed=false;enter();return barrier.then(()=>reply);}return reply;}}),s=stage(f);
 armed=true;const first=runNativeObservationRecord({chart:s.chart});let second;
 try{await Promise.race([entered,first.then(()=>assert.fail('first completed before response barrier'))]);second=await runNativeObservationRecord({chart:s.chart});}
 finally{release();}
 assert.equal(second.record.complete,false);assert.equal((await first).record.complete,false);assert.equal(s.getBackend(),null);
});

test('ordinary terminal admission reacquires the whole closure after candidate reads',async()=>{
 let f,count=0;
 f=await rolloverFixture({changeHttp:(reply,url)=>{
  if(f&&url==='https://registry.npmjs.org/foottrace/'+f.prepared.version&&++count===2){
   const current=f.cohorts.find(c=>c.run.id===500);current.run.status='completed';current.run.conclusion='success';
  }
  return reply;
 }});
 const {s,r}=await observe(f);assert.equal(r.record.complete,true);assert.equal(count,2);
 assert.equal(s.getBackend(),null);assert.equal(r.snapshot.sharedState.rolloverInspectionResult.available,false);
});
