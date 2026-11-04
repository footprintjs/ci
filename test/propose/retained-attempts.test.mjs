import test from 'node:test';
import assert from 'node:assert/strict';
import {createRetainedAttemptAssessor} from '../../src/propose/retained-attempts.mjs';
import {retainedAttemptFixture,PRIVATE} from './retained-attempt-provider-fixture.mjs';
const assess=f=>createRetainedAttemptAssessor(f.profile)(f);
test('all retained terminal attempts and only the actual current native invocation form an eligible finite snapshot',async()=>{
 const f=await retainedAttemptFixture(),r=assess(f);assert.equal(r.valid,true);assert.equal(r.eligible,true);assert.equal(r.scope,'retained-native-attempts-only');
 assert.equal(r.current.runId,500);assert.equal(r.retainedAttempts,1);assert.equal(r.providerContinuityProved,false);assert.equal(r.erasedHistoryProved,false);assert.equal(r.authorized,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('queued future jobs are distinguished only inside the independently bound current attempt',async()=>{
 const f=await retainedAttemptFixture({change:(d,p)=>{if(p.includes('/runs/500/')&&d.jobs)for(const j of d.jobs)if(j.name==='authority'){j.status='queued';j.conclusion=null;}}});
 assert.equal(assess(f).eligible,true);
});
for(const [name,change] of [
 ['an older nonterminal run',(d,p)=>{if(d.workflow_runs)for(const run of d.workflow_runs)if(run.id===100){run.status='in_progress';run.conclusion=null;}if(/runs\/100\/attempts\/1$/.test(p)){d.status='in_progress';d.conclusion=null;}}],
 ['an older nonterminal job',(d,p)=>{if(p.includes('/runs/100/')&&d.jobs){d.jobs[0].status='in_progress';d.jobs[0].conclusion=null;}}],
 ['old base-source authority activity',(d,p)=>{if(p.includes('/runs/100/')&&d.jobs)d.jobs.find(j=>j.name==='authority').conclusion='failure';}],
 ['old base-source publish activity',(d,p)=>{if(p.includes('/runs/100/')&&d.jobs)d.jobs.find(j=>j.name==='publish').conclusion='success';}],
 ['current running authority',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs){const j=d.jobs.find(j=>j.name==='authority');j.status='in_progress';j.conclusion=null;}}],
 ['current completed release effect',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs)d.jobs.find(j=>j.name==='release').conclusion='success';}],
 ['current unknown future waiting',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs){const j=d.jobs.find(j=>j.name==='publish');j.status='waiting';j.conclusion=null;}}],
 ['current failed plan',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs)d.jobs.find(j=>j.name==='plan').conclusion='failure';}],
 ['current missing required plan',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs){d.jobs=d.jobs.filter(j=>j.name!=='plan');d.total_count--;}}],
 ['current wrong prepare job',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs)d.jobs.find(j=>j.name==='prepare').id=700;}],
 ['current completed proposal job',(d,p)=>{if(p.includes('/runs/500/')&&d.jobs){const j=d.jobs.find(j=>j.name==='proposal');j.status='completed';j.conclusion='success';}}],
])test(name+' cannot admit retained eligibility',async()=>{const r=assess(await retainedAttemptFixture({change}));assert.equal(r.eligible,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);});
test('a completed actual published predecessor is not treated as a pending-candidate reservation',async()=>{
 const f=await retainedAttemptFixture({publishedPredecessor:true,change:(d,p)=>{if(p.includes('/runs/100/')&&d.jobs)d.jobs.find(j=>j.name==='publish').conclusion='success';}});
 assert.equal(assess(f).eligible,true);
});
for(const [name,change] of [
 ['missing actual current run',f=>f.collection.runs=f.collection.runs.filter(r=>r.id!==500)],
 ['wrong workflow receipt',f=>f.versions={...f.versions,workflowDigest:'0'.repeat(64)}],
 ['missing actual source version',f=>f.versions={...f.versions,sources:[]}],
 ['wrong current prepare archive',f=>f.archive.reference.jobId=999],
 ['wrong current artifact metadata',f=>f.collection.artifacts.find(a=>a.id===800).size++],
 ['wrong current run attempt',f=>f.current={...f.current,identity:{...f.current.identity,runAttempt:2}}],
 ['missing old attempt',f=>f.collection.attempts=f.collection.attempts.filter(a=>a.runId!==100)],
])test(name+' stays unknown/held',async()=>{const f=await retainedAttemptFixture();change(f);const r=assess(f);assert.equal(r.eligible,false);assert.equal(r.authorized,false);});
test('a fake nonterminal summary cannot hide the actual job state',async()=>{
 const f=await retainedAttemptFixture();const j=f.collection.attempts.find(a=>a.runId===100).jobs[0];j.status='in_progress';j.conclusion=null;f.collection.nonterminal=[];
 assert.equal(assess(f).eligible,false);
});
test('native provider unavailability never turns into an empty eligible history',async()=>{
 const f=await retainedAttemptFixture({change:(d,p)=>{if(p.includes('/actions/workflows/11/runs'))throw new Error(PRIVATE);}}),r=assess(f);
 assert.equal(r.eligible,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});

test('an incoherent nonterminal retained run cannot be hidden by completed attempt rows',async()=>{
 const f=await retainedAttemptFixture(),run=f.collection.runs.find(r=>r.id===100);run.status='in_progress';run.conclusion=null;assert.equal(assess(f).eligible,false);
});
test('an incoherent nonterminal retained attempt cannot be hidden by a completed run',async()=>{
 const f=await retainedAttemptFixture(),attempt=f.collection.attempts.find(a=>a.runId===100);attempt.status='queued';attempt.conclusion=null;assert.equal(assess(f).eligible,false);
});
test('a completed current-run observation cannot borrow an earlier running identity',async()=>{
 const f=await retainedAttemptFixture(),run=f.collection.runs.find(r=>r.id===500);run.status='completed';run.conclusion='success';assert.equal(assess(f).eligible,false);
});
test('a declared literal artifact naming profile is explicit and does not become a native package adapter',async()=>{
 const f=await retainedAttemptFixture({change:d=>{if(d.artifacts)for(const row of d.artifacts)row.name='synthetic-prepare';}});
 f.profile={...f.profile,artifactNaming:{kind:'literal',value:'synthetic-prepare'}};assert.equal(assess(f).eligible,true);
 f.profile={...f.profile,artifactNaming:{kind:'literal',value:'other-name'}};assert.equal(assess(f).eligible,false);
});
test('no profile default is inferred from an otherwise valid native collection',async()=>{
 const f=await retainedAttemptFixture();f.profile=undefined;assert.equal(assess(f).eligible,false);
});

test('missing retained attempt stays held even when a damaged summary adjusts its count',async()=>{
 const f=await retainedAttemptFixture();f.collection.attempts=f.collection.attempts.filter(a=>a.runId!==100);f.versions={...f.versions,attemptCount:1};assert.equal(assess(f).eligible,false);
});
test('an expired current artifact observation cannot reuse earlier admitted archive bytes',async()=>{
 const f=await retainedAttemptFixture({change:d=>{if(d.artifacts)for(const a of d.artifacts)if(a.id===800)a.expired=true;}});
 assert.equal(assess(f).eligible,false);
});
