import test from 'node:test';
import assert from 'node:assert/strict';
import { createRetainedWorkflowReader } from '../../src/propose/retained-workflows.mjs';
import { fixture, PRIVATE } from './retained-workflow-provider-fixture.mjs';
const read=async f=>createRetainedWorkflowReader(f)();
test('complete retained runs, every attempt, jobs and run artifacts remain observations only',async()=>{
 const f=fixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'retained-workflow-observations-only');
 assert.equal(r.runs.length,1);assert.equal(r.attempts.length,2);assert.equal(r.artifacts.length,1);
 assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.authorized,false);assert.equal(r.providerContinuityProved,false);assert.equal(r.erasedHistoryProved,false);
 assert.equal(f.calls.filter(c=>/\/attempts\/[12]$/.test(c.route)).length,4);
 assert.ok(f.calls.every(c=>c.method==='GET'&&c.body===undefined));assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('an empty retained run set is a collection fact, not permission or continuity',async()=>{
 const r=await read(fixture({runs:0}));assert.equal(r.valid,true);assert.equal(r.runs.length,0);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);
});
test('nonterminal historical work is preserved explicitly, never silently skipped',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/jobs?')){d.jobs[1].status='in_progress';d.jobs[1].conclusion=null;}}}));
 assert.equal(r.valid,true);assert.equal(r.nonterminal.length,2);assert.equal(r.effectStages.length,2);assert.equal(r.authorized,false);
});
test('candidate and unrelated source effects are both retained for later source/version admission',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/jobs?'))d.jobs[1].conclusion='failure';}}));
 assert.equal(r.valid,true);assert.equal(r.effectStages.length,2);assert.equal(r.effectStages[0].sourceSha,'a'.repeat(40));
});
test('legacy release events and historical branches are data, never current-run authority',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(d.head_sha){d.event='release';d.head_branch='v1.0.1';}
 if(d.workflow_runs)for(const row of d.workflow_runs){row.event='release';row.head_branch='v1.0.1';}}}));
 assert.equal(r.valid,true);assert.equal(r.runs[0].event,'release');assert.equal(r.authorized,false);
});
const damage=[
 ['missing complete run page', (d,p)=>{if(d.workflow_runs)d.total_count++;}],
 ['duplicate run identity',(d,p)=>{if(d.workflow_runs){d.workflow_runs.push(structuredClone(d.workflow_runs[0]));d.total_count=2;}}],
 ['changed workflow identity',(d,p,n)=>{if(p.endsWith('/actions/workflows/publish.yml')&&n.phase===2)d.id=12;}],
 ['changed retained run set',(d,p,n)=>{if(d.workflow_runs&&n.phase===2)d.workflow_runs[0].conclusion='failure';}],
 ['wrong attempt identity',(d,p)=>{if(/\/attempts\/1$/.test(p))d.run_attempt=2;}],
 ['wrong run repository',(d,p)=>{if(d.workflow_runs)d.workflow_runs[0].head_repository={id:999,full_name:'fork/foottrace'};}],
 ['unknown retained event',(d,p)=>{if(d.workflow_runs)d.workflow_runs[0].event='pull_request';}],
 ['unknown job name',(d,p)=>{if(d.jobs)d.jobs[0].name='unknown-stage';}],
 ['missing terminal conclusion',(d,p)=>{if(d.jobs)d.jobs[0].conclusion=null;}],
 ['job wrong head',(d,p)=>{if(d.jobs)d.jobs[0].head_sha='b'.repeat(40);}],
 ['job wrong run',(d,p)=>{if(d.jobs)d.jobs[0].run_id=999;}],
 ['job wrong attempt',(d,p)=>{if(d.jobs)d.jobs[0].run_attempt=8;}],
 ['artifact wrong source',(d,p)=>{if(d.artifacts)d.artifacts[0].workflow_run.head_sha='b'.repeat(40);}],
 ['artifact wrong repository',(d,p)=>{if(d.artifacts)d.artifacts[0].workflow_run.repository_id=999;}],
 ['artifact wrong run',(d,p)=>{if(d.artifacts)d.artifacts[0].workflow_run.id=999;}],
 ['changed adjacent artifact',(d,p,n)=>{if(d.artifacts&&n.phase===2)d.artifacts[0].expired=true;}],
 ['changed adjacent jobs',(d,p,n)=>{if(d.jobs&&n.phase===2)d.jobs[0].conclusion='failure';}],
 ['changed latest attempt detail',(d,p)=>{if(/\/attempts\/2$/.test(p))d.conclusion='failure';}],
 ['attempt bound',(d,p)=>{if(d.workflow_runs)d.workflow_runs[0].run_attempt=9;}],
 ['run bound',(d,p)=>{if(d.workflow_runs){d.total_count=65;d.workflow_runs=Array.from({length:65},(_,i)=>({...d.workflow_runs[0],id:i+1}));}}],
 ['nominal scalar privacy',(d,p)=>{if(d.workflow_runs)d.workflow_runs[0].head_sha={private:PRIVATE};}],
];
for(const [name,change] of damage)test(name+' holds with finite evidence',async()=>{
 const r=await read(fixture({change}));assert.equal(r.valid,false);assert.equal(r.reason,'retained-workflow-unavailable');assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('unavailable reads retain a failed boundary without error text',async()=>{
 const f=fixture(),base=f.api;f.api=(m,p,b)=>{if(p.includes('/jobs?'))throw new Error(PRIVATE);return base(m,p,b);};
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.observations.some(x=>x.status==='unavailable'));assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('private unowned provider fields cannot change an admitted digest',async()=>{
 const one=await read(fixture()),two=await read(fixture({change:d=>{d.private='DIFFERENT-PRIVATE';}}));
 assert.equal(one.valid,true);assert.equal(two.valid,true);assert.equal(one.digest,two.digest);
});

test('artifact identities cannot alias across retained runs',async()=>{
 const r=await read(fixture({runs:2,change:d=>{if(d.artifacts)d.artifacts[0].id=2000;}}));assert.equal(r.valid,false);
});
test('job identities cannot alias across attempts or runs',async()=>{
 const r=await read(fixture({change:d=>{if(d.jobs){d.jobs[0].id=1000;d.jobs[1].id=1001;}}}));assert.equal(r.valid,false);
});
test('an empty collection still binds the exact repository and native workflow profile',async()=>{
 const r=await read(fixture({runs:0}));assert.equal(r.valid,true);assert.equal(r.repository?.id,123);assert.equal(r.repository.full_name,'footprintjs/foottrace');
 assert.equal(r.workflow.path,'.github/workflows/publish.yml');
});

test('the complete 64-run boundary is admitted as observations',async()=>{
 const r=await read(fixture({runs:64}));assert.equal(r.valid,true);assert.equal(r.runs.length,64);assert.equal(r.attempts.length,128);
});
test('all attempts, including a genuinely running latest attempt, stay distinct data',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(d.workflow_runs){d.workflow_runs[0].status='in_progress';d.workflow_runs[0].conclusion=null;}
 if(/\/attempts\/2$/.test(p)){d.status='in_progress';d.conclusion=null;}}}));
 assert.equal(r.valid,true);assert.equal(r.attempts[0].status,'completed');assert.equal(r.attempts[1].status,'in_progress');assert.equal(r.nonterminal.length,1);
 assert.equal(r.authorized,false);
});
test('a getter in a nominal run identity is refused without invoking it',async()=>{
 let invoked=false;const r=await read(fixture({change:d=>{if(d.workflow_runs)Object.defineProperty(d.workflow_runs[0],'head_sha',{get(){invoked=true;throw new Error(PRIVATE);}});}}));
 assert.equal(r.valid,false);assert.equal(invoked,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});

test('coherent foreign head repositories in every retained list and attempt still hold',async()=>{
 const f=fixture({change:d=>{
  if(d.head_repository)d.head_repository={id:999,full_name:'fork/foottrace'};
  if(d.workflow_runs)for(const row of d.workflow_runs)row.head_repository={id:999,full_name:'fork/foottrace'};
 }});const r=await read(f);assert.equal(r.valid,false);assert.equal(r.authorized,false);
});
