import {rolloverSuccessorFixture,PRIVATE} from './rollover-successor-provider-fixture.mjs';
export async function rolloverRefFixture({refStatus=200,refApply=true,refReplyChange=()=>{},refEffectChange=()=>{},...options}={}){
 const f=await rolloverSuccessorFixture(options),refMoves=[];
 return {...f,refMoves,makeInvocation:()=>{
  const invocation=f.makeInvocation(),original=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const path=new URL(url).pathname;
   if(request.method==='PATCH'&&path.endsWith('/git/refs/heads/release/next')){
    const payload=JSON.parse(request.body);refMoves.push(payload);
    const data=refApply?(await f.f.api('PATCH',path,payload)).data:{object:{type:'commit',sha:f.f.tip}};
    refEffectChange(f);refReplyChange(data);
    return refStatus===200?Response.json(data):new Response(PRIVATE,{status:refStatus});
   }
   return original(url,request);
  };return invocation;
 }};
}
