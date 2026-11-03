import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {createFoottraceTransport,foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
/** Actual-shaped HTTP over an offline native model; synthetic unregistered key only. */
export function nativeHttpFixture({model=managedReleaseFixture({published:true}),api=model.api,change=()=>{},limits}={}) {
 const f=model,calls=[],keys=generateKeyPairSync('rsa',{modulusLength:2048}),key=keys.privateKey.export({type:'pkcs8',format:'pem'});
 const fetcher=async(url,options)=>{
  const target=new URL(url),headers=new Headers(options.headers);calls.push({host:target.host,path:target.pathname,auth:headers.get('authorization'),cookie:headers.get('cookie'),redirect:options.redirect});
  if(target.origin==='https://registry.npmjs.org'){
   assert.equal(headers.has('authorization'),false);assert.equal(headers.has('cookie'),false);assert.equal(options.credentials,'omit');
   const raw=await f.fetcher(url,options),response=target.pathname.endsWith('.tgz')?new Response(raw.body,{status:raw.status,headers:{'content-type':'application/octet-stream'}}):raw;
   return change(response,url)??response;
  }
  assert.equal(target.origin,'https://api.github.com');let reply;
  if(target.pathname==='/app'){
   const token=headers.get('authorization')?.slice(7),parts=token?.split('.');assert.equal(parts?.length,3);
   assert.equal(verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),keys.publicKey,Buffer.from(parts[2],'base64url')),true);
   assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).iss,f.options.settings.clientId);
   reply={data:{id:700,slug:f.options.settings.slug,client_id:f.options.settings.clientId}};
  }else{
   assert.equal(headers.get('authorization'),'Bearer offline_registry_token');
   try{reply=await api(options.method,target.pathname+target.search,headers.get('accept')==='application/octet-stream'?{accept:'application/octet-stream'}:undefined);}
   catch(error){
    if(!Number.isInteger(error?.status)||error.status<400||error.status>599)throw error;
    return new Response('{}',{status:error.status,headers:{'content-type':'application/json'}});
   }
  }
  const binary=Buffer.isBuffer(reply.data),zip=target.pathname.endsWith('/zip');
  const response=new Response(binary?reply.data:JSON.stringify(reply.data),{headers:{'content-type':zip?'application/zip':binary?'application/octet-stream':'application/json'}});
  return change(response,url)??response;
 };
 const makeClient=factory=>factory({repository:f.repository,token:'offline_registry_token',appIdentity:{...f.options.settings,privateKey:key},fetcher,limits});
 const transport=makeClient(createFoottraceTransport);
 const port=foottraceTransportPort(transport),context={repository:f.repository,sha:f.context.sha};
 return {f,calls,port,transport,context,makeClient,fullContext:structuredClone(f.context)};
}
