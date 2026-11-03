import test from 'node:test';
import assert from 'node:assert/strict';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
import {captureFoottraceMetadataWriterInvocation,captureFoottraceProposalInvocation} from '../../src/propose/proposal-invocation.mjs';
import {foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
import {createFoottracePendingObservationReader} from '../../src/propose/foottrace-pending.mjs';
const implementation=await import('../../src/propose/foottrace-metadata-checks.mjs').catch(()=>({}));
function ensure(){assert.equal(typeof implementation.createFoottraceMetadataCheckReader,'function','C1 actual native required-check reader is missing');return implementation.createFoottraceMetadataCheckReader;}
async function fixture(change=()=>{},inspection=false){
 const f=await proposalBootstrapFixture(),i=f.makeInvocation(),original=i.fetcher,calls=[];
 let read=0;
 i.fetcher=async(url,options)=>{
  const parsed=new URL(url),p=parsed.pathname;let data=null;
  const isCI=p.includes('/actions/workflows/ci.yml')||p.includes('/actions/workflows/70/runs')||p.includes('/actions/runs/700/')||p.includes('/actions/runs/701/'),
   isSecurity=p.includes('/actions/workflows/codeql.yml')||p.includes('/actions/workflows/80/runs')||p.includes('/actions/runs/800/');
  if(!isCI&&!isSecurity)return original(url,options);
  assert.equal(options.method,'GET');calls.push(p);read++;
  const workflowId=isCI?70:80,runId=isCI?(p.includes('/actions/runs/701/')?701:700):800,workflow=isCI?'ci.yml':'codeql.yml';
  const run={id:runId,run_attempt:1,head_sha:f.head,event:'pull_request',head_repository:f.fullContext.repository,
   workflow_id:workflowId,path:'.github/workflows/'+workflow,status:'completed',conclusion:'success'};
  if(p.endsWith('/actions/workflows/'+workflow))data={id:workflowId,path:run.path};
  else if(p.endsWith('/actions/workflows/'+workflowId+'/runs'))data={total_count:1,workflow_runs:[run]};
  else if(p.endsWith('/actions/runs/'+runId+'/attempts/1'))data=run;
  else if(p.endsWith('/actions/runs/'+runId+'/attempts/1/jobs'))data={total_count:isCI?3:2,jobs:(isCI?['check (22)','check (24)','tested-tree']:['Analyze (javascript-typescript)','Analyze (actions)']).map((name,j)=>({
   id:runId+j+1,name,status:'completed',conclusion:'success',run_id:runId,run_attempt:1,
   steps:name==='tested-tree'?[{name:'tested tree '+f.f.commits.get(f.head).tree.sha,conclusion:'success'}]:[]
  }))};
  else throw Error('fixture-unhandled-check-route');
  change(data,p,{read,isCI,isSecurity});
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const captured=(inspection?captureFoottraceProposalInvocation:captureFoottraceMetadataWriterInvocation)(i);
 const port=foottraceTransportPort(captured.transport);
 const pending=await createFoottracePendingObservationReader({api:port.api,context:{repository:captured.context.repository,sha:captured.context.sha},settings:{slug:port.settings.slug}})();
 assert.equal(pending.valid,true);
 return {...f,captured,pending,calls};
}
async function run(change,mutate){
 const f=await fixture(change),read=ensure()(f.captured),ref=structuredClone(f.pending.reference);mutate?.(ref);
 return {f,r:await read(ref)};
}
test('C1 required checks reuse actual native CI/tested-tree and CodeQL guards on the captured writer owner',async()=>{
 const {f,r}=await run();assert.equal(r.valid,true);assert.equal(r.scope,'metadata-required-checks-only');
 assert.equal(r.reference.head,f.head);assert.equal(r.ci.runId,700);assert.equal(r.security.runId,800);
 assert.equal(r.authorized,false);assert.equal(r.writerCredentialBindingAdmitted,false);
 assert.ok(f.calls.length>0);assert.match(r.digest,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
for(const kind of ['failed-check','missing-check','wrong-tested-tree','wrong-CI-attempt','failed-security','wrong-security-attempt'])test('native '+kind+' never becomes admitted C1 input',async()=>{
 const {r}=await run((data,p,{isCI,isSecurity})=>{
  if(kind==='failed-check'&&isCI&&p.endsWith('/jobs'))data.jobs[0].conclusion='failure';
  if(kind==='missing-check'&&isCI&&p.endsWith('/jobs'))data.jobs.pop();
  if(kind==='wrong-tested-tree'&&isCI&&p.endsWith('/jobs'))data.jobs[2].steps[0].name='tested tree '+'f'.repeat(40);
  if(kind==='wrong-CI-attempt'&&isCI&&p.endsWith('/attempts/1'))data.run_attempt=2;
  if(kind==='failed-security'&&isSecurity&&p.endsWith('/jobs'))data.jobs[1].conclusion='failure';
  if(kind==='wrong-security-attempt'&&isSecurity&&p.endsWith('/attempts/1'))data.run_attempt=2;
 });assert.equal(r.valid,false);assert.equal(r.authorized,false);
});
test('required-check acquisition failures keep private diagnostics out and never imply fallback success',async()=>{
 const {r}=await run(()=>{throw Error(PRIVATE);});assert.equal(r.valid,false);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(r.reason,'metadata-required-checks-unavailable');
});
test('a different caller reference cannot retarget the native check identity',async()=>{
 const {r}=await run(undefined,ref=>ref.head='f'.repeat(40));assert.equal(r.valid,false);
});
test('a later changed successful run cannot replace the initially observed current check identity',async()=>{
 let ciLists=0;const {f,r}=await run((data,p,{isCI})=>{if(isCI&&p.endsWith('/runs')&&++ciLists>=2)data.workflow_runs[0].id=701;});
 assert.equal(r.valid,false);
 assert.ok(f.calls.some(p=>p.endsWith('/actions/runs/701/attempts/1')),'changed successful run must be acquired');
 assert.ok(f.calls.some(p=>p.endsWith('/actions/runs/701/attempts/1/jobs')),'changed successful run jobs must be acquired');
 assert.equal(r.observations.length,2,'both fully successful native observations must reach the final identity comparison');
 assert.notEqual(r.observations[0].digest,r.observations[1].digest);
});
test('inspection owner cannot masquerade as the C1 captured writer for required-check admission',async()=>{
 const create=ensure(),f=await fixture(undefined,true);assert.throws(()=>create(f.captured));
});
