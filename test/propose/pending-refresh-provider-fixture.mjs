import {successorFixture,PRIVATE} from './pending-successor-provider-fixture.mjs';
export {PRIVATE};
/** Synthetic native complete refresh ONLY; never a hosted or private-App effect. */
export async function refreshFixture({refStatus=200,refApply=true,metadataStatus=200,metadataApply=true,refReplyChange=()=>{},...options}={}){
 const f=await successorFixture({status:metadataStatus,apply:metadataApply,...options}),refMoves=[],calls=[];
 return {...f,refMoves,makeInvocation:()=>{
  const invocation=f.makeInvocation(),original=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const path=new URL(url).pathname;calls.push({path,method:request.method});
   if(request.method==='PATCH'&&path.endsWith('/git/refs/heads/release/next')){
    const payload=JSON.parse(request.body);refMoves.push(payload);
    let data={object:{type:'commit',sha:f.f.tip}};
    if(refApply){data=(await f.f.api('PATCH',path,payload)).data;f.pending.head.sha=f.f.tip;}
    refReplyChange(data);return refStatus===200?Response.json(data):new Response(PRIVATE,{status:refStatus});
   }
   return original(url,request);
  };return invocation;
 },refreshCalls:calls};
}
