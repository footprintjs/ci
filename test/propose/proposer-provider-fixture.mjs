import assert from 'node:assert/strict';
import {createFoottraceTransport} from '../../src/propose/foottrace-transport.mjs';
import {pendingProviderFixture} from './pending-provider-fixture.mjs';
import {identityFactsFixture} from './identity-facts-fixture.mjs';
export const PRIVATE='PRIVATE-CURRENT-PROPOSER-HTTP-BODY';
/** Synthetic cached facts plus actual-shaped live token reads; no JWT or private App GET. */
export function proposerFixture({change=()=>{},http=()=>null,changeFacts=()=>{},extra=()=>undefined,download=()=>{throw new Error('unexpected external request');}}={}){
 const pending=pendingProviderFixture(),settings={slug:'agentfootprint-release',clientId:'offline_client'},
  context={repository:pending.context.repository,sha:pending.context.sha,runId:500,runAttempt:1,eventName:'push',ref:'refs/heads/main'},seen=[];
 let runReads=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);if(u.origin!=='https://api.github.com')return download(String(url),options);
  assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,u.pathname.endsWith('/zip')?'manual':'error');
  const path=u.pathname+u.search;assert.notEqual(path,'/app');assert.equal(options.headers.authorization,'Bearer offline_test_token');
  seen.push({path,authKind:'repository-token'});let data;
  if(path==='/repos/footprintjs/foottrace')data={...context.repository,default_branch:'main',archived:false,permissions:{push:true},private:PRIVATE};
  else if(path.endsWith('/git/ref/heads/main'))data={object:{sha:context.sha,type:'commit'},private:PRIVATE};
  else if(path.includes('/git/commits/'))data={sha:context.sha,tree:{sha:pending.prepared.sourceTree},private:PRIVATE};
  else if(path.startsWith('/users/'))data={id:500,login:settings.slug+'[bot]',type:'Bot',private:PRIVATE};
  else if(path.endsWith('/actions/runs/500')){runReads++;data={id:500,run_attempt:1,head_sha:context.sha,repository:context.repository,head_repository:context.repository,
   path:'.github/workflows/publish.yml',head_branch:'main',event:'push',status:'in_progress',conclusion:null,private:PRIVATE};}
  else if(path.includes('/attempts/1/jobs?'))data={total_count:2,jobs:[
   {id:600,name:'prepare',run_id:500,run_attempt:1,head_sha:context.sha,status:'completed',conclusion:'success',private:PRIVATE},
   {id:601,name:'proposal',run_id:500,run_attempt:1,head_sha:context.sha,status:'in_progress',conclusion:null,private:PRIVATE}]};
  else{data=extra(path);if(data===undefined)throw new Error('fixture-route');}
  change(data,path,{runReads,appReads:0});const override=http(path,data,{runReads,appReads:0});if(override)return override;
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const facts=identityFactsFixture({context,clientId:settings.clientId});changeFacts(facts);
 const transport=createFoottraceTransport({repository:context.repository,token:'offline_test_token',appIdentity:{...settings,facts},fetcher});
 return {transport,context,prepared:pending.prepared,settings,seen};
}
