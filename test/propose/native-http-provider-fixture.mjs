import assert from 'node:assert/strict';
import {createFoottraceTransport,foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
import {identityFactsFixture} from './identity-facts-fixture.mjs';
import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
/** Actual-shaped token-only HTTP over an offline native model; synthetic cached facts, no shared JWT. */
export function nativeHttpFixture({model=managedReleaseFixture({published:true}),api=model.api,change=()=>{},limits}={}) {
 const f=model,calls=[];
 f.options.settings.slug='agentfootprint-release';f.bot.login=f.options.settings.slug+'[bot]';
 for(const row of f.pulls)if(row.user?.id===f.bot.id)row.user.login=f.bot.login;
 const fetcher=async(url,options)=>{
  const target=new URL(url),headers=new Headers(options.headers);calls.push({host:target.host,path:target.pathname,auth:headers.get('authorization'),cookie:headers.get('cookie'),redirect:options.redirect});
  if(target.origin==='https://registry.npmjs.org'){
   assert.equal(headers.has('authorization'),false);assert.equal(headers.has('cookie'),false);assert.equal(options.credentials,'omit');
   const raw=await f.fetcher(url,options),response=target.pathname.endsWith('.tgz')?new Response(raw.body,{status:raw.status,headers:{'content-type':'application/octet-stream'}}):raw;
   return change(response,url)??response;
  }
  assert.equal(target.origin,'https://api.github.com');let reply;
  assert.notEqual(target.pathname,'/app','shared code cannot hold or use a private-App JWT');
  assert.equal(headers.get('authorization'),'Bearer offline_registry_token');
  try{reply=await api(options.method,target.pathname+target.search,headers.get('accept')==='application/octet-stream'?{accept:'application/octet-stream'}:undefined);}
  catch(error){
   if(!Number.isInteger(error?.status)||error.status<400||error.status>599)throw error;
   return new Response('{}',{status:error.status,headers:{'content-type':'application/json'}});
  }
  const binary=Buffer.isBuffer(reply.data),zip=target.pathname.endsWith('/zip');
  const response=new Response(binary?reply.data:JSON.stringify(reply.data),{headers:{'content-type':zip?'application/zip':binary?'application/octet-stream':'application/json'}});
  return change(response,url)??response;
 };
 const makeClient=factory=>factory({repository:f.repository,token:'offline_registry_token',appIdentity:{...f.options.settings,facts:identityFactsFixture({context:f.context,clientId:f.options.settings.clientId})},fetcher,limits});
 const transport=makeClient(createFoottraceTransport);
 const port=foottraceTransportPort(transport),context={repository:f.repository,sha:f.context.sha};
 return {f,calls,port,transport,context,makeClient,fullContext:structuredClone(f.context)};
}
