import {isOpaqueCredential} from '../http-credential.cjs';
import {createHash} from 'node:crypto';
import {jsonData,fields,id,text} from './json-data.mjs';
const SHA=/^[a-f0-9]{40}$/;
const readers=new WeakSet();
export const isEcoReader=value=>readers.has(value);
const failures=new Set(['eco-request-limit','eco-response-limit','eco-transport','eco-redirect','eco-http','eco-body','eco-json']);
const refuse=(code,status)=>{const error=new Error(code);error.code=code;if(Number.isInteger(status)&&status>=100&&status<=599)error.status=status;throw error;};
const bound=(value,fallback,ceiling)=>{const n=value??fallback;if(!Number.isSafeInteger(n)||n<1||n>ceiling)refuse('eco-options');return n;};
/** Generate fixed API routes from finite data. No caller URL/method/headers. */
function route(raw){
 try{
  const r=jsonData(raw,4096);text(r.repository,/^footprintjs\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);
  return Object.freeze({target:r,path:pathFor(r)});
 }catch{refuse('eco-route');}
}
function pathFor(r){
  const prefix='/repos/'+r.repository;
  switch(r.resource){
   case 'repository':fields(r,['resource','repository']);return prefix;
   case 'main':fields(r,['resource','repository']);return prefix+'/git/ref/heads/main';
   case 'pull':fields(r,['resource','repository','pullNumber']);id(r.pullNumber);return prefix+'/pulls/'+r.pullNumber;
   case 'commit':fields(r,['resource','repository','sha']);text(r.sha,SHA,40);return prefix+'/git/commits/'+r.sha;
   case 'compare':fields(r,['resource','repository','anchor','sha']);text(r.anchor,SHA,40);text(r.sha,SHA,40);return prefix+'/compare/'+r.anchor+'...'+r.sha;
   case 'ledger':
    fields(r,['resource','repository','name','sha']);text(r.sha,SHA,40);
    if(r.repository!=='footprintjs/ci'||!['policy','versions','work'].includes(r.name))refuse('eco-route');
    return prefix+'/contents/ledger/'+r.name+'.json?ref='+r.sha;
   case 'comments':case 'checks':{
    const comments=r.resource==='comments';fields(r,['resource','repository',comments?'pullNumber':'sha','page']);
    id(r.page);if(r.page>8)refuse('eco-route');
    if(comments)id(r.pullNumber);else text(r.sha,SHA,40);
    return prefix+(comments?'/issues/'+r.pullNumber+'/comments':'/commits/'+r.sha+'/check-runs')+'?per_page=100&page='+r.page+(comments?'':'&filter=all');
   }
   default:refuse('eco-route');
  }
}
/** Isolated JSON-only adapter. The existing release transport intentionally has
 * a different asset/registry security boundary; no caller escape hatch extends it.
 * Parsed payloads remain backend-only until a finite projection is made.
 * Optional already-existing credentials are confined to api.github.com GETs.
 */
export function createEcoReader({fetcher=globalThis.fetch,githubToken,maxRequests,maxBytes,maxResponseBytes}={}){
 const requestLimit=bound(maxRequests,64,64),byteLimit=bound(maxBytes,8*1024*1024,8*1024*1024),responseLimit=bound(maxResponseBytes,1024*1024,1024*1024);
 if(typeof fetcher!=='function'||(githubToken!==undefined&&!isOpaqueCredential(githubToken)))refuse('eco-options');
 let requests=0,bytes=0,omitted=0;const observations=[];
 const remember=observation=>{if(observations.length<65)observations.push(observation);else omitted=Math.min(Number.MAX_SAFE_INTEGER,omitted+1);};
 async function read(target){
  const request=route(target);
  try{const result=await perform(request);remember(result.observation);return result;}
  catch(error){
   const reason=failures.has(error?.code)?error.code:'eco-transport';
   const status=Number.isInteger(error?.status)&&error.status>=100&&error.status<=599?error.status:null;
   remember(Object.freeze({...request.target,kind:'failed',reason,status,requestNumber:requests}));refuse(reason,status);
  }
 }
 async function perform(request){
  if(bytes>=byteLimit)refuse('eco-response-limit');if(requests>=requestLimit)refuse('eco-request-limit');requests++;
  let response;
  try{response=await fetcher('https://api.github.com'+request.path,{method:'GET',redirect:'manual',headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28',...(githubToken?{authorization:'Bearer '+githubToken}:{})},signal:AbortSignal.timeout(10000)});}
  catch{refuse('eco-transport');}
  const cancel=async()=>{try{await response.body?.cancel();}catch{}};
  if(!response||!Number.isInteger(response.status))refuse('eco-transport');
  if(response.status>=300&&response.status<400){await cancel();refuse('eco-redirect');}
  if(response.status!==200){await cancel();refuse('eco-http',response.status);}
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^[0-9]{1,10}$/.test(declared)||Number(declared)>responseLimit||Number(declared)>byteLimit-bytes)){await cancel();refuse('eco-response-limit');}
  const stream=response.body?.getReader();if(!stream)refuse('eco-body');
  const chunks=[];let size=0;
  try{
   for(;;){
    const next=await stream.read();if(next.done)break;
    const length=next.value?.byteLength;if(!Number.isSafeInteger(length))refuse('eco-body');
    size+=length;bytes+=length;
    if(size>responseLimit||bytes>byteLimit){await stream.cancel();refuse('eco-response-limit');}
    chunks.push(Buffer.from(next.value));
   }
  }catch(error){if(error?.code==='eco-response-limit')throw error;try{await stream.cancel();}catch{}refuse('eco-body');}
  const raw=Buffer.concat(chunks);let data;
  try{data=jsonData(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));}catch{refuse('eco-json');}
  const observation=Object.freeze({...request.target,kind:'response',requestNumber:requests,status:200,bytes:size,sha256:createHash('sha256').update(raw).digest('hex'),hasNext:/(?:^|,)\s*<[^>]*>\s*;\s*rel="next"(?:\s*(?:,|$))/.test(response.headers.get('link')??'')});
  return Object.freeze({data,observation});
 }
 const reader=Object.freeze({read,observations:()=>observations.slice(),totals:()=>Object.freeze({requests,bytes,omittedObservations:omitted})});readers.add(reader);return reader;
}
