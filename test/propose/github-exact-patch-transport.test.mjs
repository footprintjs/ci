import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubTransport} from '../../src/propose/github-transport.mjs';
const repository={id:123,full_name:'footprintjs/foottrace'};
const base='https://api.github.com/repos/'+repository.full_name,route=base+'/pulls/43';
const desired={title:'Release 1.11.1',body:'Exact computed notes\né'};
const headers={authorization:'Bearer offline_patch_token','content-type':'application/json'};
const options={method:'PATCH',headers,body:JSON.stringify(desired)};
const requestBytes=Buffer.byteLength(options.body);
function fixture(reply=()=>new Response('{"number":43}',{headers:{'content-type':'application/json'}}),limits){
 const calls=[],transport=createGitHubTransport({repository,limits,fetcher:async(url,init)=>{
  calls.push({url,init});return reply(url,init,calls.length);
 }});
 assert.equal(typeof transport.createExactPatchView,'function','closed exact PATCH view is absent');
 const patch=()=>transport.createExactPatchView({pullNumber:43,desired});
 return {transport,calls,patch};
}
test('exact PATCH has a distinct closed view; ordinary views remain GET-only',async()=>{
 const f=fixture();await assert.rejects(f.transport.createView().fetch(route,options));
 assert.equal(f.calls.length,0);const view=f.patch(),response=await view.fetch(route,options);
 assert.deepEqual(await response.json(),{number:43});assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,route);assert.equal(f.calls[0].init.method,'PATCH');
 assert.equal(f.calls[0].init.body,JSON.stringify(desired));assert.equal(f.calls[0].init.redirect,'error');
 assert.equal(f.calls[0].init.credentials,'omit');assert.equal(f.calls[0].init.headers.authorization,headers.authorization);
 assert.equal(view.facts().fetchAttempts,1);
 assert.equal(JSON.stringify(f.transport.facts()).includes('offline_patch_token'),false);
});
for(const [label,url,change] of [
 ['other repository',base.replace('foottrace','other')+'/pulls/43',{}],
 ['other pull',base+'/pulls/44',{}],['query',route+'?x=1',{}],['fragment',route+'#x',{}],
 ['other origin',route.replace('api.github.com','other.invalid'),{}],['userinfo',route.replace('https://','https://user:password@'),{}],
 ['create',route,{method:'POST'}],['delete',route,{method:'DELETE'}],['read',route,{method:'GET'}],
 ['different bytes',route,{body:JSON.stringify({...desired,body:'other'})}],
 ['extra field',route,{body:JSON.stringify({...desired,state:'closed'})}],
 ['reordered bytes',route,{body:JSON.stringify({body:desired.body,title:desired.title})}],
 ['missing body',route,{body:undefined}]
])test('closed PATCH rejects '+label+' before fetch and leaves a valid attempt available',async()=>{
 const f=fixture(),view=f.patch();await assert.rejects(view.fetch(url,{...options,...change}));
 assert.equal(f.calls.length,0);await view.fetch(route,options);assert.equal(f.calls.length,1);
});
test('binding owns exact metadata before caller mutation and never invokes a DATA getter',async()=>{
 const f=fixture(),input={title:desired.title,body:desired.body},view=f.transport.createExactPatchView({pullNumber:43,desired:input});
 input.title='mutated';await view.fetch(route,options);assert.equal(f.calls[0].init.body,JSON.stringify(desired));
 let reads=0;const hostile={get title(){reads++;return desired.title;},body:desired.body};
 assert.throws(()=>f.transport.createExactPatchView({pullNumber:43,desired:hostile}));assert.equal(reads,0);
});
for(const desired of [
 {title:'',body:''},{title:'é'.repeat(129),body:''},{title:'x',body:'é'.repeat(32769)},
 {title:'\ud800',body:''},{title:'x',body:'\udfff'},{title:'x',body:null},
 {title:'x',body:'',extra:true}
])test('invalid exact metadata binding refuses without HTTP',()=>{
 const f=fixture();assert.throws(()=>f.transport.createExactPatchView({pullNumber:43,desired}));assert.equal(f.calls.length,0);
});
for(const pullNumber of [0,-1,1.5,'43',Number.MAX_SAFE_INTEGER+1])test('invalid pull identity refuses without HTTP',()=>{
 const f=fixture();assert.throws(()=>f.transport.createExactPatchView({pullNumber,desired}));assert.equal(f.calls.length,0);
});
test('one invocation cannot repeat PATCH through a new view after success; GET remains available',async()=>{
 const f=fixture();await f.patch().fetch(route,options);await assert.rejects(f.patch().fetch(route,options));
 assert.equal(f.calls.length,1);await f.transport.createView().fetch(route,{method:'GET',headers});
 assert.equal(f.calls.length,2);assert.equal(f.transport.facts().exhausted,false);
});
test('uncertain response consumes the one invocation attempt but allows GET verification',async()=>{
 const f=fixture((u,o)=>{if(o.method==='PATCH')throw new Error('PRIVATE-PROVIDER-ERROR');return new Response('{}',{headers:{'content-type':'application/json'}});});
 await assert.rejects(f.patch().fetch(route,options),e=>!String(e).includes('PRIVATE-PROVIDER'));
 await assert.rejects(f.patch().fetch(route,options));assert.equal(f.calls.length,1);
 await f.transport.createView().fetch(route,{method:'GET',headers});assert.equal(f.calls.length,2);
 const later=fixture();await later.patch().fetch(route,options);assert.equal(later.calls.length,1);
 // Fresh transport is necessary, never sufficient: domain eligibility is deliberately outside this IO facet.
});
test('concurrent views cannot each start a PATCH',async()=>{
 let finish;const pending=new Promise(r=>{finish=r;}),f=fixture(()=>pending);
 const first=f.patch().fetch(route,options),second=f.patch().fetch(route,options).then(()=>false,()=>true);
 try {assert.equal(f.calls.length,1);} finally {finish(new Response('{}',{headers:{'content-type':'application/json'}}));}
 await first;assert.equal(await second,true);
});
test('PATCH and GET charge the same request bank and abort controller',async()=>{
 const f=fixture(undefined,{requests:1,totalBytes:1024});await f.patch().fetch(route,options);
 await assert.rejects(f.transport.createView().fetch(route,{method:'GET',headers}));
 assert.equal(f.calls.length,1);assert.equal(f.transport.facts().exhausted,true);assert.equal(f.calls[0].init.signal.aborted,true);
});
test('GET and PATCH share byte admission; overflow cancels before copying and disables all views',async()=>{
 let cancelled=false;const f=fixture((u,o)=>o.method==='GET'?new Response('123',{headers:{'content-type':'application/json'}}):
  new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.enqueue(new Uint8Array([1]));c.close();},cancel(){cancelled=true;}}),
   {headers:{'content-type':'application/json'}}),{requests:8,totalBytes:requestBytes+5});
 await f.transport.createView().fetch(route,{method:'GET',headers});await assert.rejects(f.patch().fetch(route,options));
 assert.equal(f.transport.facts().exhausted,true);assert.equal(f.transport.facts().admittedBytes,requestBytes+3);
 assert.equal(cancelled,true);await assert.rejects(f.transport.createView().fetch(route,{method:'GET',headers}));assert.equal(f.calls.length,2);
});
test('local PATCH limit cannot borrow the larger owner bank',async()=>{
 const f=fixture(),view=f.transport.createExactPatchView({pullNumber:43,desired,limits:{requests:1,totalBytes:5}});
 await assert.rejects(view.fetch(route,options));assert.equal(f.transport.facts().exhausted,true);
});
for(const status of [201,202,204,301,302,307,308])test('PATCH refuses non200 success or redirect '+status+' without following it',async()=>{
 const f=fixture(()=>new Response(null,{status,headers:{location:'https://other.invalid/private','content-type':'application/json'}}));
 await assert.rejects(f.patch().fetch(route,options));assert.equal(f.calls.length,1);
});
test('PATCH error body is cancelled, status retained and never read',async()=>{
 let cancelled=false,reads=0;const f=fixture(()=>({status:403,ok:false,headers:new Headers(),body:{
  cancel:async()=>{cancelled=true;},getReader(){reads++;throw new Error('PRIVATE-BODY');}
 }}));const response=await f.patch().fetch(route,options);assert.equal(response.status,403);
 assert.equal(await response.text(),'');assert.equal(cancelled,true);assert.equal(reads,0);
 await assert.rejects(f.patch().fetch(route,options));assert.equal(f.calls.length,1);
});
for(const type of ['text/html','application/octet-stream'])test('PATCH does not admit '+type+' as JSON',async()=>{
 const f=fixture(()=>new Response('{}',{headers:{'content-type':type}}));await assert.rejects(f.patch().fetch(route,options));assert.equal(f.calls.length,1);
});
test('PATCH oversized declared response is cancelled before body acquisition',async()=>{
 let cancelled=false,reads=0;const f=fixture(()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json','content-length':String(2*1024*1024+1)}),
 body:{cancel:async()=>{cancelled=true;},getReader(){reads++;throw new Error('PRIVATE');}}}));
 await assert.rejects(f.patch().fetch(route,options));assert.equal(cancelled,true);assert.equal(reads,0);
});
test('aborted PATCH does not initiate a network request or leak its private reason',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort('PRIVATE-ABORT');
 await assert.rejects(f.patch().fetch(route,{...options,signal:controller.signal}),e=>!String(e).includes('PRIVATE-ABORT'));assert.equal(f.calls.length,0);
});

test('PATCH fixed streamed response cap applies even with a larger owner budget',async()=>{
 let cancelled=false;const f=fixture(()=>new Response(new ReadableStream({
  start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.enqueue(new Uint8Array([1]));c.close();},
  cancel(){cancelled=true;}
 }),{headers:{'content-type':'application/json'}}));
 await assert.rejects(f.patch().fetch(route,options));assert.equal(cancelled,true);
 assert.equal(f.transport.facts().exhausted,true);assert.equal(f.transport.facts().admittedBytes,requestBytes);
});
