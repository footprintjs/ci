import assert from 'node:assert/strict';
import {rolloverFixture} from './rollover-provider-fixture.mjs';
export const PRIVATE='PRIVATE-ORDINARY-OBJECT-EFFECT';
/** Actual-shaped offline native provider only. No live writer/run or effect. */
export async function rolloverSuccessorFixture({effectStatus=201,effectApply=true,effectChange=()=>{},commitChange=()=>{},...options}={}){
 const f=await rolloverFixture(options),effects=[],calls=[];
 const makeInvocation=()=>{
  const invocation=f.makeInvocation(),read=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const path=new URL(url).pathname;calls.push({path,method:request.method});
   if(request.method==='POST'){
    assert.ok(['/git/blobs','/git/trees','/git/commits'].some(x=>path.endsWith(x)));
    const payload=JSON.parse(request.body);effects.push({path,payload});effectChange(path,{f,effects});
    const data=effectApply?(await f.f.api('POST',path,payload)).data:{};
    const status=typeof effectStatus==='function'?effectStatus(path):effectStatus;
    return status===201?Response.json(data,{status}):new Response(PRIVATE,{status});
   }
   if(request.method==='GET'&&!path.includes('/git/commits/')&&/\/commits\/[a-f0-9]{40}$/.test(path)){
    const sha=path.split('/').at(-1),c=f.f.commits.get(sha);assert.ok(c);
    const data={sha,parents:structuredClone(c.parents),author:{...f.f.bot},committer:{...f.f.bot},
     commit:{tree:structuredClone(c.tree),verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE}}};
    commitChange(data,path,{f,effects});return Response.json(data);
   }
   return read(url,request);
  };return invocation;
 };
 return {...f,effects,calls,makeInvocation};
}
