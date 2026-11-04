import {rolloverRefFixture} from './rollover-ref-provider-fixture.mjs';
import {PRIVATE} from './rollover-successor-provider-fixture.mjs';
export async function rolloverProposalFixture({prStatus=201,prApply=true,prReplyChange=()=>{},prEffectChange=()=>{},...options}={}){
 const f=await rolloverRefFixture(options),prCreates=[];
 return {...f,prCreates,makeInvocation:()=>{
  const invocation=f.makeInvocation(),original=invocation.fetcher;
  invocation.fetcher=async(url,request)=>{
   const path=new URL(url).pathname;
   if(request.method==='POST'&&path==='/repos/footprintjs/foottrace/pulls'){
    const payload=JSON.parse(request.body);prCreates.push(payload);let data={};
    if(prApply){data=(await f.f.api('POST',path,payload)).data;Object.assign(data,{title:payload.title,body:payload.body,auto_merge:null});}
    prEffectChange(f);const reply=structuredClone(data);prReplyChange(reply);
    return prStatus===201?Response.json(reply,{status:201}):new Response(PRIVATE,{status:prStatus});
   }
   return original(url,request);
  };return invocation;
 }};
}
