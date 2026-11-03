import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createFoottraceTransport} from '../../src/propose/foottrace-transport.mjs';
import {pendingProviderFixture} from './pending-provider-fixture.mjs';
// Synthetic and unregistered test key. No real App credential is read or stored.
const keyPair=generateKeyPairSync('rsa',{modulusLength:2048});
const privateKey=keyPair.privateKey.export({type:'pkcs8',format:'pem'});
export const PRIVATE='PRIVATE-CURRENT-PROPOSER-HTTP-BODY';
export function proposerFixture({change=()=>{},http=()=>null,extra=()=>undefined,download=()=>{throw new Error('unexpected external request');}}={}) {
 const pending=pendingProviderFixture(),settings={slug:'foottrace-release',clientId:'offline_client'},
  context={repository:pending.context.repository,sha:pending.context.sha,runId:500,runAttempt:1,eventName:'push',ref:'refs/heads/main'},seen=[];
 let appReads=0,runReads=0;
 const fetcher=async(url,options)=>{
  const u=new URL(url);if(u.origin!=='https://api.github.com')return download(String(url),options);assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.redirect,u.pathname.endsWith('/zip')?'manual':'error');
  const path=u.pathname+u.search;let data;
  if(path==='/app'){
   appReads++;assert.equal(options.redirect,'error');const auth=options.headers.authorization;assert.notEqual(auth,'Bearer offline_test_token');
   const parts=auth.slice(7).split('.');assert.equal(parts.length,3);
   assert.equal(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),keyPair.publicKey,Buffer.from(parts[2],'base64url')),true);
   assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).iss,settings.clientId);
   seen.push({path,authKind:'verified-synthetic-app-jwt'});data={id:77,slug:settings.slug,client_id:settings.clientId,private:PRIVATE};
  }else{
   assert.equal(options.headers.authorization,'Bearer offline_test_token');seen.push({path,authKind:'repository-token'});
   if(path==='/repos/footprintjs/foottrace')data={...context.repository,default_branch:'main',archived:false,permissions:{push:true},private:PRIVATE};
   else if(path.endsWith('/git/ref/heads/main'))data={object:{sha:context.sha,type:'commit'},private:PRIVATE};
   else if(path.includes('/git/commits/'))data={sha:context.sha,tree:{sha:pending.prepared.sourceTree},private:PRIVATE};
   else if(path.startsWith('/users/'))data={id:500,login:settings.slug+'[bot]',type:'Bot',private:PRIVATE};
   else if(path.endsWith('/actions/runs/500')){runReads++;data={id:500,run_attempt:1,head_sha:context.sha,repository:context.repository,head_repository:context.repository,
    path:'.github/workflows/publish.yml',head_branch:'main',event:'push',status:'in_progress',conclusion:null,private:PRIVATE};}
   else if(path.includes('/attempts/1/jobs?'))data={total_count:2,jobs:[
    {id:600,name:'prepare',run_id:500,run_attempt:1,head_sha:context.sha,status:'completed',conclusion:'success',private:PRIVATE},
    {id:601,name:'proposal',run_id:500,run_attempt:1,head_sha:context.sha,status:'in_progress',conclusion:null,private:PRIVATE}]};
   else {data=extra(path);if(data===undefined)throw new Error('fixture-route');}
  }
  change(data,path,{appReads,runReads});
  const override=http(path,data,{appReads,runReads});if(override)return override;
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const transport=createFoottraceTransport({repository:context.repository,token:'offline_test_token',appIdentity:{...settings,privateKey},fetcher});
 return {transport,context,prepared:pending.prepared,settings,seen};
}
