import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoottraceTransport,foottraceMetadataPatchPort,foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
const PRIVATE='PRIVATE-NETWORK-SCOPE-ERROR',repository={id:123,full_name:'footprintjs/foottrace'};
function fixture(reply,limits){
 let calls=0;const transport=createFoottraceTransport({repository,limits,token:'offline_exact_patch_owner',
  appIdentity:{slug:'offline-release',clientId:'offline-client',privateKey:'offline-unregistered-placeholder'},
  fetcher:async(url,options)=>{calls++;return reply(url,options);}});
 const port=foottraceMetadataPatchPort(transport,{pullNumber:43,desired:{title:'Release 1.11.1',body:'Exact computed notes'}});
 const observe=()=>{assert.equal(typeof port.observation,'function','actual exact endpoint has no finite attempt observation');return port.observation();};
 return {transport,port,observe,calls:()=>calls,read:foottraceTransportPort(transport)};
}
for(const [status,state] of [[200,'returned'],[408,'uncertain'],[500,'uncertain'],[502,'uncertain'],[503,'uncertain'],[504,'uncertain'],
 [400,'rejected'],[401,'rejected'],[403,'rejected'],[404,'rejected'],[409,'rejected'],[422,'rejected'],[429,'rejected'],
 [201,'failed'],[202,'failed'],[301,'failed'],[501,'failed'],[505,'failed']])test('actual native exact PATCH HTTP '+status+' is '+state+' without permission or response body disclosure',async()=>{
 const f=fixture(()=>new Response(status===200?'{"number":43}':PRIVATE,{status,headers:{'content-type':'application/json'}}));
 assert.equal(f.observe().state,'not-attempted');
 const settled=await f.port.setExact().then(()=>true,()=>false);
 assert.equal(settled,status===200);assert.equal(f.observe().state,state);assert.equal(f.calls(),1);
 assert.equal(f.observe().authorized,false);assert.equal(f.observe().reconciled,false);
 assert.equal(JSON.stringify(f.observe()).includes(PRIVATE),false);assert.equal(Object.isFrozen(f.observe()),true);
 await assert.rejects(f.port.setExact());assert.equal(f.calls(),1);assert.equal(f.observe().state,state);
});
for(const code of ['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET'])test('finite native fetch failure '+code+' is uncertain only after the bound endpoint starts',async()=>{
 const f=fixture(()=>{throw new TypeError('fetch failed',{cause:Object.assign(new Error(PRIVATE),{code})});});
 assert.equal(f.observe().state,'not-attempted');await assert.rejects(f.port.setExact(),e=>!String(e).includes(PRIVATE));
 assert.equal(f.observe().state,'uncertain');assert.equal(f.calls(),1);
});
for(const error of [new Error(PRIVATE),new TypeError(PRIVATE),new TypeError('fetch failed',{cause:{code:'UNKNOWN_PRIVATE'}}),
 new TypeError('fetch failed',{cause:{code:'ECONNRESET',get extra(){throw new Error(PRIVATE);}}})])test('unexpected fetch exception stays technical failure unless its finite network shape is positively recognized',async()=>{
 // The extra-data getter is unrelated and must never run; a recognized own code
 // may still classify this last synthetic network cause without inspecting it.
 const recognized=Object.getOwnPropertyDescriptor(error.cause??{},'code')?.value==='ECONNRESET';
 const f=fixture(()=>{throw error;});await assert.rejects(f.port.setExact());assert.equal(f.observe().state,recognized?'uncertain':'failed');
 assert.equal(JSON.stringify(f.observe()).includes(PRIVATE),false);
});
test('a cause-code accessor is not executed or accepted as finite network evidence',async()=>{
 let reads=0;const error=new TypeError('fetch failed',{cause:{get code(){reads++;return 'ECONNRESET';}}});
 const f=fixture(()=>{throw error;});await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'failed');assert.equal(reads,0);
});
test('authorization rejection cannot be converted to uncertainty by private response text',async()=>{
 const f=fixture(()=>new Response('fetch failed ECONNRESET '+PRIVATE,{status:403}));
 await assert.rejects(f.port.setExact(),e=>e.status===403);assert.equal(f.observe().state,'rejected');assert.equal(f.calls(),1);
});
test('a returned HTTP200 JSON parse error is technical failure, never network uncertainty or reconciliation',async()=>{
 const f=fixture(()=>new Response(PRIVATE,{headers:{'content-type':'application/json'}}));
 await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'returned');assert.equal(f.observe().reconciled,false);
});
test('known network uncertainty leaves GET verification available on the same owner without another PATCH',async()=>{
 const f=fixture((url,options)=>{
  if(options.method==='PATCH')throw new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
  return Response.json({number:43});
 });
 await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'uncertain');
 assert.deepEqual(await f.read.api('GET','/repos/footprintjs/foottrace/pulls/43'),{data:{number:43}});
 assert.equal(f.calls(),2);assert.equal(f.observe().state,'uncertain');
 const later=foottraceMetadataPatchPort(f.transport,{pullNumber:43,desired:{title:'Release 1.11.1',body:'Exact computed notes'}});
 await assert.rejects(later.setExact());assert.equal(f.calls(),2);
});
test('invalid returned adapter data and invalid MIME are technical failures, not a caught-success uncertainty',async()=>{
 for(const reply of [()=>({status:'500',ok:false}),()=>new Response('{}',{headers:{'content-type':'text/html'}})]){
  const f=fixture(reply);await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'failed');
 }
});

for(const name of ['AbortError','TimeoutError'])test('actual admitted fetch interrupted by its own '+name+' signal is narrowly uncertain',async()=>{
 const {createGitHubTransport}=await import('../../src/propose/github-transport.mjs'),caller=new AbortController();
 const desired={title:'Release 1.11.1',body:'Exact computed notes'},url='https://api.github.com/repos/footprintjs/foottrace/pulls/43';
 let calls=0;
 const owner=createGitHubTransport({repository,fetcher:async(u,options)=>{
  calls++;caller.abort(new DOMException(PRIVATE,name));throw options.signal.reason;
 }}),view=owner.createExactPatchView({pullNumber:43,desired});
 await assert.rejects(view.fetch(url,{method:'PATCH',body:JSON.stringify(desired),signal:caller.signal}));
 assert.equal(calls,1);assert.equal(view.observation().state,'uncertain');assert.equal(JSON.stringify(view.observation()).includes(PRIVATE),false);
});
test('a signal aborted before admission starts no request and cannot claim submission uncertainty',async()=>{
 const {createGitHubTransport}=await import('../../src/propose/github-transport.mjs'),caller=new AbortController();caller.abort(new DOMException(PRIVATE,'AbortError'));
 const desired={title:'Release 1.11.1',body:'Exact computed notes'};let calls=0;
 const owner=createGitHubTransport({repository,fetcher:async()=>{calls++;throw new Error(PRIVATE);}}),view=owner.createExactPatchView({pullNumber:43,desired});
 await assert.rejects(view.fetch('https://api.github.com/repos/footprintjs/foottrace/pulls/43',{method:'PATCH',body:JSON.stringify(desired),signal:caller.signal}));
 assert.equal(calls,0);assert.equal(view.observation().state,'not-attempted');
});
test('response budget exhaustion is technical failure and does not masquerade as a network timeout',async()=>{
 const f=fixture(()=>new Response('x'.repeat(1024),{headers:{'content-type':'application/json'}}),{requests:4,totalBytes:128});
 await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'failed');assert.equal(f.read.transportFacts().exhausted,true);
});
test('an in-flight closed request is only diagnostic and cannot be mistaken for reconciliation',async()=>{
 let finish;const response=new Promise(r=>{finish=r;}),f=fixture(()=>response),pending=f.port.setExact();
 try{assert.equal(f.observe().state,'in-flight');assert.equal(f.observe().authorized,false);assert.equal(f.observe().reconciled,false);}
 finally{finish(Response.json({number:43}));}
 await pending;assert.equal(f.observe().state,'returned');assert.equal(f.observe().reconciled,false);
});
test('unknown cancellation reasons after submission remain technical failures',async()=>{
 const {createGitHubTransport}=await import('../../src/propose/github-transport.mjs'),caller=new AbortController(),desired={title:'Release 1.11.1',body:'Exact computed notes'};
 const owner=createGitHubTransport({repository,fetcher:async(u,options)=>{caller.abort(PRIVATE);throw options.signal.reason;}}),view=owner.createExactPatchView({pullNumber:43,desired});
 await assert.rejects(view.fetch('https://api.github.com/repos/footprintjs/foottrace/pulls/43',{method:'PATCH',body:JSON.stringify(desired),signal:caller.signal}));
 assert.equal(view.observation().state,'failed');assert.equal(JSON.stringify(view.observation()).includes(PRIVATE),false);
});

test('a network-shaped exception in response processing is technical failure, outside the actual fetch classification point',async()=>{
 const network=()=>new TypeError('fetch failed',{cause:{code:'ECONNRESET'}});
 for(const reply of [
  ()=>({status:200,ok:true,headers:{get(){throw network();}}}),
  ()=>({status:500,ok:false,body:{async cancel(){throw network();}}})
 ]){
  const f=fixture(reply);await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'failed');
 }
});
test('a message getter on an unexpected exception cannot supply the finite native fetch shape',async()=>{
 let reads=0;const error=new TypeError(PRIVATE,{cause:{code:'ECONNRESET'}});
 Object.defineProperty(error,'message',{get(){reads++;return 'fetch failed';}});
 const f=fixture(()=>{throw error;});await assert.rejects(f.port.setExact());
 assert.equal(f.observe().state,'failed');assert.equal(reads,0);
});

test('an aborted signal does not turn a different unexpected DOMException into its own cancellation',async()=>{
 const {createGitHubTransport}=await import('../../src/propose/github-transport.mjs'),caller=new AbortController(),desired={title:'Release 1.11.1',body:'Exact computed notes'};
 const owner=createGitHubTransport({repository,fetcher:async()=>{
  caller.abort(new DOMException('recognized own reason','AbortError'));throw new DOMException(PRIVATE,'AbortError');
 }}),view=owner.createExactPatchView({pullNumber:43,desired});
 await assert.rejects(view.fetch('https://api.github.com/repos/footprintjs/foottrace/pulls/43',{method:'PATCH',body:JSON.stringify(desired),signal:caller.signal}));
 assert.equal(view.observation().state,'failed');
});
test('a network code attached to an unexpected TypeError message does not broaden the recognized native fetch shape',async()=>{
 const f=fixture(()=>{throw new TypeError(PRIVATE,{cause:{code:'ECONNRESET'}});});
 await assert.rejects(f.port.setExact());assert.equal(f.observe().state,'failed');
});
