import test from 'node:test';
import assert from 'node:assert/strict';
import {FlowChartExecutor} from 'footprintjs';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
import {containsRecordText} from './record-text-fixture.mjs';
const module=await import('../../src/propose/foottrace-metadata-bootstrap.mjs').catch(()=>({}));
const factoryModule=await import('../../src/propose/proposal-bootstrap-flow.mjs').catch(()=>({}));
async function run(f,extra={}){
 assert.equal(typeof module.runFoottraceMetadataBootstrapInspection,'function','captured host root and native history do not compose in one production input run');
 const invocation=f.makeInvocation(),r=await module.runFoottraceMetadataBootstrapInspection({...invocation,...extra});
 return {r,invocation};
}
test('one captured runtime owner joins actual source/private identity and native history in one executor',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),{r,invocation}=await run(f);
 assert.equal(r.status,'metadata-bootstrap-only');assert.equal(r.record.complete,true);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
 assert.equal(r.report.writerCredentialBindingAdmitted,false);assert.equal(r.report.retainedEligibilityAdmitted,false);
 assert.equal(r.backend.context.sha,f.M);assert.equal(r.backend.current.digest,r.backend.history.current.digest);
 assert.equal(r.backend.prepared.targetTree,r.backend.history.prepared.targetTree);
 assert.equal(r.backend.transport.scope,'captured-native-http-owner');
 const log=r.record.snapshot.commitLog,at=id=>log.findIndex(row=>row.stageId===id);
 assert.ok(at('proposal-bootstrap-result')>=0);assert.ok(at('metadata-bootstrap-root-boundary')>at('proposal-bootstrap-result'));
 assert.ok(at('metadata-history-invocation')>at('metadata-bootstrap-root-boundary'));
 assert.ok(at('metadata-bootstrap-current-recheck')>at('metadata-history-result'));
 assert.equal(log.filter(row=>row.stageId==='proposal-bootstrap-result').length,1);
 assert.equal(log.filter(row=>row.stageId==='metadata-history-result').length,1);
 assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);assert.equal(Object.hasOwn(invocation.env,'APP_PRIVATE_KEY'),false);
 assert.equal(containsRecordText(r.record,PRIVATE),false);assert.equal(containsRecordText(r.record,r.backend.history.metadata.payload.body),false);
});
test('stale metadata remains observed input only, with no PATCH or terminal/release permission',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native',metadata:{title:'Old release',body:'Old notes'}}),{r}=await run(f);
 assert.equal(r.status,'metadata-bootstrap-only');assert.equal(r.backend.history.metadata.observation.matches,false);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
 assert.equal(r.report.writerCredentialBindingAdmitted,false);
});
test('invalid Actions aliases stop before provider reads and erase credentials',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native',changeEnv:e=>{e.GITHUB_SHA='f'.repeat(40);}}),{r,invocation}=await run(f);
 assert.equal(r.status,'incomplete');assert.equal(r.backend,null);assert.equal(f.calls.length,0);
 assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);assert.equal(Object.hasOwn(invocation.env,'APP_PRIVATE_KEY'),false);
});
test('an invalid CODE host stops at the actual root boundary before historical preparation is acquired',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),{r}=await run(f,{host:null});
 assert.equal(r.status,'incomplete');assert.equal(r.backend,null);assert.equal(f.calls.length,0);
});
test('dirty source after native history cannot borrow its earlier observed root',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),original=f.host.requireClean;
 let historySeen=false;const invocation=f.makeInvocation(),fetch=invocation.fetcher;
 invocation.fetcher=async(url,options)=>{if(new URL(url).pathname.endsWith('/actions/workflows/publish.yml'))historySeen=true;return fetch(url,options);};
 invocation.host={...f.host,requireClean:()=>{if(historySeen)throw new Error(PRIVATE);return original();}};
 assert.equal(typeof module.runFoottraceMetadataBootstrapInspection,'function');
 const r=await module.runFoottraceMetadataBootstrapInspection(invocation);
 assert.equal(historySeen,true);assert.equal(r.status,'held');assert.equal(r.backend,null);
 assert.equal(r.report.reason,'metadata-bootstrap-root-drift');assert.equal(containsRecordText(r.record,PRIVATE),false);
});
test('incomplete final capture discards all joined private runtime input',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),{r}=await run(f,{recordLimitBytes:256});
 assert.equal(r.status,'incomplete');assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
});
test('DATA start/executor/continuation fields never choose the production executor or native branch',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'});let reads=0;
 const hook={get build(){reads++;throw new Error(PRIVATE);}};
 const {r}=await run(f,{start:hook,executor:hook,completed:true,continuation:()=>{reads++;throw new Error(PRIVATE);}});
 assert.equal(r.status,'metadata-bootstrap-only');assert.equal(reads,0);assert.equal(r.report.authorized,false);
});
test('the CODE root factory refuses a second native execution and clears earlier backend before provider IO',async()=>{
 assert.equal(typeof factoryModule.createFoottraceProposalBootstrapInspection,'function','actual bootstrap prefix has no composing factory');
 const f=await proposalBootstrapFixture(),invocation=f.makeInvocation(),prefix=factoryModule.createFoottraceProposalBootstrapInspection(invocation);
 assert.ok(prefix.getInvocationInput());assert.equal(prefix.getBackend(),null);
 assert.equal(Object.hasOwn(invocation.env,'GH_TOKEN'),false);
 const chart=prefix.chart.build(),first=new FlowChartExecutor(chart);await first.run();assert.ok(prefix.getBackend());
 const requests=f.calls.length,second=new FlowChartExecutor(chart);await assert.rejects(()=>second.run());
 assert.equal(f.calls.length,requests);assert.equal(prefix.getBackend(),null);
});

for(const kind of ['root-stage','history-stage','commit-count'])test('synthetic native '+kind+' observation drift cannot cross its input boundary',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),snapshot=FlowChartExecutor.prototype.getSnapshot,count=FlowChartExecutor.prototype.getCommitCount;
 let changed=false;
 try{
  if(kind==='commit-count')FlowChartExecutor.prototype.getCommitCount=function(){changed=true;return count.call(this)+1;};
  else FlowChartExecutor.prototype.getSnapshot=function(){
   const value=snapshot.call(this),wanted=kind==='root-stage'?'proposal-bootstrap-result':'metadata-history-result';
   if(value.commitLog.some(row=>row.stageId===wanted)){
    changed=true;return {...value,commitLog:value.commitLog.map(row=>row.stageId===wanted?{...row,stageId:'synthetic-uncommitted-stage'}:row)};
   }
   return value;
  };
  const {r}=await run(f);assert.equal(changed,true);assert.equal(r.status,'incomplete');assert.equal(r.backend,null);
 }finally{FlowChartExecutor.prototype.getSnapshot=snapshot;FlowChartExecutor.prototype.getCommitCount=count;}
});
test('post-history current preparation is reacquired rather than borrowed from the earlier root',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),invocation=f.makeInvocation(),fetch=invocation.fetcher;
 let historySeen=false,changed=false;
 // A package-blob substitution is also caught by the independent full host
 // inventory read, so it cannot prove this reconstruction check. Instead,
 // model inconsistent provider commit-day metadata on the same immutable ID:
 // host tree/blob facts remain equal while preparation must change or HOLD.
 invocation.fetcher=async(url,options)=>{
  const pathname=new URL(url).pathname;
  if(pathname.endsWith('/actions/workflows/publish.yml'))historySeen=true;
  const response=await fetch(url,options);
  if(historySeen&&pathname.endsWith('/git/commits/'+f.M)){
   const data=await response.json();data.committer.date='2026-11-04T00:00:00Z';changed=true;
   return Response.json(data);
  }
  return response;
 };
 assert.equal(typeof module.runFoottraceMetadataBootstrapInspection,'function');
 const r=await module.runFoottraceMetadataBootstrapInspection(invocation);
 assert.equal(changed,true);assert.equal(r.status,'held');assert.equal(r.backend,null);
 assert.equal(r.report.reason,'metadata-bootstrap-root-drift');
});
test('all native prefixes charge one captured request bank',async()=>{
 const f=await proposalBootstrapFixture({retainedJobs:'full-native'}),{r}=await run(f,{limits:{requests:1,totalBytes:128*1024*1024}});
 assert.equal(r.backend,null);assert.equal(r.status,'incomplete');assert.equal(f.calls.length,1);
});
