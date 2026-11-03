import assert from 'node:assert/strict';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
export {PRIVATE};
/** Synthetic provider ONLY: actual native readers/flow run, no hosted producer or workflow adoption. */
export async function metadataC1Fixture({exact=false,status=200,apply=true,invalidJSON=false,responseChange=()=>{},readChange=()=>{},checkChange=()=>{},checkFailure=false,...options}={}){
 const metadata={title:'Stale release',body:'Stale notes'};
 const f=await proposalBootstrapFixture({retainedJobs:'full-native',metadata:exact?'exact':metadata,...options});
 const patches=[],calls=[];
 const makeInvocation=()=>{
  const invocation=f.makeInvocation(),original=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const p=new URL(url).pathname;calls.push({path:p,method:request.method});
   if(request.method==='PATCH'){
    assert.equal(p,'/repos/footprintjs/foottrace/pulls/101');
    const payload=JSON.parse(request.body);patches.push(payload);
    if(apply)Object.assign(metadata,payload);
    if(status!==200)return new Response(PRIVATE,{status});
    if(invalidJSON)return new Response(PRIVATE,{headers:{'content-type':'application/json'}});
    const data=await (await original(url,{...request,method:'GET',body:undefined})).json();
    responseChange(data);return Response.json(data);
   }
   assert.equal(request.method,'GET');
   const isCI=p.includes('/actions/workflows/ci.yml')||p.includes('/actions/workflows/70/runs')||p.includes('/actions/runs/700/'),
    isSecurity=p.includes('/actions/workflows/codeql.yml')||p.includes('/actions/workflows/80/runs')||p.includes('/actions/runs/800/');
   if(!isCI&&!isSecurity){readChange(p,{patches,calls});return original(url,request);}
   const workflowId=isCI?70:80,runId=isCI?700:800,workflow=isCI?'ci.yml':'codeql.yml';
   const run={id:runId,run_attempt:1,head_sha:f.head,event:'pull_request',head_repository:f.fullContext.repository,
    workflow_id:workflowId,path:'.github/workflows/'+workflow,status:'completed',conclusion:'success'};
   let data;
   if(p.endsWith('/actions/workflows/'+workflow))data={id:workflowId,path:run.path};
   else if(p.endsWith('/actions/workflows/'+workflowId+'/runs'))data={total_count:1,workflow_runs:[run]};
   else if(p.endsWith('/actions/runs/'+runId+'/attempts/1'))data=run;
   else if(p.endsWith('/actions/runs/'+runId+'/attempts/1/jobs'))data={total_count:isCI?3:2,jobs:(isCI?['check (22)','check (24)','tested-tree']:['Analyze (javascript-typescript)','Analyze (actions)']).map((name,j)=>({
    id:runId+j+1,name,status:'completed',conclusion:checkFailure&&isCI?'failure':'success',run_id:runId,run_attempt:1,
    steps:name==='tested-tree'?[{name:'tested tree '+f.f.commits.get(f.head).tree.sha,conclusion:'success'}]:[]
   }))};
   else throw Error('fixture-unhandled-check-route');
   checkChange(data,p);readChange(p,{patches,calls});return Response.json(data);
  };
  return invocation;
 };
 return {...f,makeInvocation,patches,calls,metadata};
}
