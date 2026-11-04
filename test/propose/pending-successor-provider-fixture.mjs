import assert from 'node:assert/strict';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
export {PRIVATE};
/** Synthetic native provider only; real owning flow, no hosted/current App effect. */
export async function successorFixture({effectStatus=201,effectApply=true,responseChange=()=>{},metadataResponseChange=()=>{},effectChange=()=>{},...options}={}){
 const f=await metadataC1Fixture({sameTree:false,responseChange:metadataResponseChange,...options}),effects=[],calls=[];
 const makeInvocation=()=>{
  const invocation=f.makeInvocation(),read=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const path=new URL(url).pathname;calls.push({path,method:request.method});
   if(request.method==='POST'){
    assert.ok(['/git/blobs','/git/trees','/git/commits'].some(t=>path.endsWith(t)),'closed successor object endpoint');
    const payload=JSON.parse(request.body);effects.push({path,payload});effectChange(path,{effects,f});
    let data={};
    if(effectApply)data=(await f.f.api('POST',path,payload)).data;
    responseChange(data,path,{effects,f});
    const status=typeof effectStatus==='function'?effectStatus(path,{effects,f}):effectStatus;
    if(status!==201)return new Response(PRIVATE,{status});
    return Response.json(data,{status:201});
   }
   if(request.method==='GET'&&!path.includes('/git/commits/')&&/\/commits\/[a-f0-9]{40}$/.test(path)&&!path.endsWith('/commits/'+f.head)){
    const sha=path.split('/').at(-1),c=f.f.commits.get(sha);assert.ok(c,'known actual synthetic commit');
    const data={sha,parents:structuredClone(c.parents),author:{...f.f.bot},committer:{...f.f.bot},
     commit:{tree:structuredClone(c.tree),verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE}}};
    responseChange(data,path,{effects,f});return Response.json(data);
   }
   return read(url,request);
  };return invocation;
 };
 return {...f,effects,calls,makeInvocation};
}
