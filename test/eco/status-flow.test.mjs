import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {createEcoReader} from '../../src/eco/github-reader.mjs';
const path=new URL('../../src/eco/status-flow.mjs',import.meta.url);const mod=existsSync(path)?await import(path):{};
import {fixture,anchor,policyFixture} from './fixtures/github.mjs';
const target={repository:'footprintjs/ci',pullNumber:2,action:'merge-source'};
const head='a'.repeat(40),base='b'.repeat(40),tree='c'.repeat(40);
function reader(){return createEcoReader({fetcher:async(url)=>{
 const path=new URL(url).pathname;let value;
 if(path.endsWith('/pulls/2'))value={number:2,state:'open',head:{sha:head,repo:{id:1,full_name:target.repository}},base:{sha:base,ref:'main',repo:{id:1,full_name:target.repository}}};
 else if(path.includes('/git/ref/'))value={ref:'refs/heads/main',object:{type:'commit',sha:base}};
 else if(path.includes('/git/commits/'))value={sha:head,tree:{sha:tree}};
 else if(path.includes('/comments'))value=[{id:100,user:{id:7},body:'secret raw /Users/private'}];
 else if(path.includes('/check-runs'))value={total_count:0,check_runs:[]};
 else value={id:1,full_name:target.repository};
 return new Response(JSON.stringify(value));
 }});}
const run=async args=>{assert.equal(typeof mod.runEcoStatus,'function','native eco status feature required');return mod.runEcoStatus(args);};
test('native observe/admit/diff/report decisions record unknown prior policy without raw provider data',async()=>{
 const r=await run({target,reader:reader()});assert.equal(r.status,'unknown');assert(r.report.findings.includes('policy-unanchored'));assert(r.report.findings.includes('verdict-missing'));assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.record.complete,true);
 const saved=JSON.stringify(r);assert.doesNotMatch(saved,/secret raw|\/Users\/private|Bearer/);for(const stage of ['observe','admit','diff','report'])assert(saved.includes(stage+'-decision'));
 assert(r.record.snapshot.commitLog.length>=4);assert(r.record.snapshot.recorders.find(x=>x.id==='control'));
});
test('reopened native record explains final decision through actual reads and commits without requests',async()=>{
 const r=await run({target,reader:reader()});assert.equal(typeof mod.explainEcoRecord,'function');
 const explanation=mod.explainEcoRecord(JSON.parse(JSON.stringify(r.record)),'reportFacts');assert.match(explanation,/report.*wrote: reportFacts/);assert.match(explanation,/diff.*via diffFacts/);assert.match(explanation,/observeSources/);
 assert.match(mod.explainEcoRecord({complete:false},'reportFacts'),/Incomplete/);assert.match(mod.explainEcoRecord(r.record,'arbitrary'),/Unsupported/);
});
test('read failures and invalid caller data produce a native unknown boundary with no leaked error',async()=>{
 let requests=0;const broken=createEcoReader({fetcher:async()=>{requests++;throw Error('token private /Users/secret');}});
 const r=await run({target,reader:broken});assert.equal(r.status,'unknown');assert.equal(r.report.authorized,false);assert(r.report.findings.includes('observation-unavailable'));assert.doesNotMatch(JSON.stringify(r),/token private|\/Users\/secret/);assert.equal(requests,1);
 const invalid=await run({target:{...target,unsafe:'private'},reader:reader()});assert.equal(invalid.status,'unknown');assert.doesNotMatch(JSON.stringify(invalid),/unsafe|private/);
});
test('bounded record refusal never claims saved evidence is complete',async()=>{
 const r=await run({target,reader:reader(),recordLimitBytes:512});assert.equal(r.status,'incomplete');assert.equal(r.record.complete,false);assert.equal(r.record.snapshot,undefined);
});

test('actual prior policy holds and native required checks remain separate from verdict metadata',async()=>{
 const f=fixture();const r=await run({target,anchor,reader:f.reader});assert.equal(r.status,'held');assert(r.report.findings.includes('repo-held'));assert(r.report.findings.includes('verdict-missing'));assert.equal(r.report.policyBound,true);
 const wrongApp=fixture(u=>u.pathname.includes('/check-runs')?{total_count:1,check_runs:[{id:10,name:'check',app:{id:999},head_sha:head,status:'completed',conclusion:'success'}]}:undefined);
 const missing=await run({target,anchor,reader:wrongApp.reader});assert(missing.report.findings.includes('checks-missing'));
 const retry=fixture(u=>u.pathname.includes('/check-runs')?{total_count:2,check_runs:[{id:10,name:'check',app:{id:15368},head_sha:head,status:'completed',conclusion:'success'},{id:11,name:'check',app:{id:15368},head_sha:head,status:'in_progress',conclusion:null}]}:undefined);
 const newer=await run({target,anchor,reader:retry.reader});assert(newer.report.findings.includes('checks-not-green'));assert.equal(newer.report.authorized,false);
});

test('a failed external handoff is saved as a bounded source boundary, never as remote absence',async()=>{
 const r=await run({target,reader:createEcoReader({fetcher:async()=>new Response('private failure body',{status:404})})});
 const sources=r.record.snapshot.sharedState.observeSources;assert.equal(sources.responses[0].status,404);assert.equal(sources.responses[0].reason,'eco-http');assert.equal(sources.responses[0].resource,'repository');
 assert(r.report.findings.includes('observation-unavailable'));assert.doesNotMatch(JSON.stringify(r),/private failure body/);assert.match(r.record.snapshot.sharedState.observeFacts.sourcesDigest,/^[a-f0-9]{64}$/);
});

test('global pause false cannot clear a repo hold, and native profiles remain an explicit unobserved guard',async()=>{
 const held=policyFixture(p=>{p.releasesPaused=false;});const h=await run({target,anchor:held.anchor,reader:held.reader});assert.equal(h.status,'held');assert(h.report.findings.includes('repo-held'));
 const native=policyFixture(p=>{p.repositories[0].approvalProfile='foottrace-disclosed-user';p.repositories[0].held=false;p.repositories[0].holds=[];});
 const n=await run({target,anchor:native.anchor,reader:native.reader});assert.equal(n.status,'unknown');assert(n.report.findings.includes('native-approval-unobserved'));assert(n.report.findings.includes('verdict-missing'));
});
