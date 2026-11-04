import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubTransport} from '../../src/propose/github-transport.mjs';
const repo={id:123,full_name:'footprintjs/foottrace'},base='https://api.github.com/repos/'+repo.full_name;
const artifact=base+'/actions/artifacts/800/zip',signed='https://synthetic.blob.core.windows.net/container/artifact.zip?sig=PRIVATE-SIGNED-QUERY';
const TOKEN='Bearer offline_transport_token',PRIVATE='PRIVATE-HTTP-ERROR';
const options={method:'GET',headers:{authorization:TOKEN,accept:'application/vnd.github+json'}};
function fixture(reply=(u,o)=>new Response('{"id":77}',{headers:{'content-type':'application/json'}}),limits) {
 const calls=[],transport=createGitHubTransport({repository:repo,limits,fetcher:async(u,o)=>{calls.push({url:String(u),options:o});return reply(String(u),o,calls.length);}});
 return {transport,view:transport.createView(),calls};
}
test('bounded JSON bytes preserve content type and GET/auth routing without exposing headers in facts',async()=>{
 const f=fixture(),r=await f.view.fetch(base,options);assert.deepEqual(await r.json(),{id:77});
 assert.equal(f.calls[0].options.redirect,'error');assert.equal(f.calls[0].options.headers.authorization,TOKEN);
 assert.equal(f.transport.facts().fetchAttempts,1);assert.equal(f.transport.facts().admittedBytes,9);assert.equal(JSON.stringify(f.transport.facts()).includes(TOKEN),false);
});
for(const host of ['synthetic.blob.core.windows.net','results-receiver.actions.githubusercontent.com'])test('one documented artifact redirect to '+host+' drops all credentials',async()=>{
 const f=fixture((u,o,n)=>n===1?new Response(null,{status:302,headers:{location:signed.replace('synthetic.blob.core.windows.net',host)}}):new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'application/zip'}}));
 const r=await f.view.fetch(artifact,options);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].options.redirect,'manual');assert.equal(f.calls[0].options.headers.authorization,TOKEN);
 const h=new Headers(f.calls[1].options.headers);assert.equal(h.has('authorization'),false);assert.equal(h.has('cookie'),false);assert.equal(h.has('x-github-api-version'),false);
 assert.equal(f.calls[1].options.redirect,'error');assert.equal(f.calls[0].options.signal,f.calls[1].options.signal);
 assert.equal(f.transport.facts().fetchAttempts,2);assert.equal(JSON.stringify(f.transport.facts()).includes('sig='),false);
});
test('direct artifact200 is admitted without an extra request',async()=>{
 const f=fixture(()=>new Response(new Uint8Array([1,2]),{headers:{'content-type':'application/octet-stream'}}));await f.view.fetch(artifact,options);assert.equal(f.calls.length,1);
});
for(const location of [
 'http://synthetic.blob.core.windows.net/private','https://synthetic.blob.core.windows.net.evil.invalid/private','https://evilblob.core.windows.net/private',
 'https://user:pass@synthetic.blob.core.windows.net/private','https://synthetic.blob.core.windows.net:444/private','https://127.0.0.1/private',
 'https://api.github.com/private','https://other.invalid/private','https://synthetic.blob.core.windows.net/private#fragment',
 '//synthetic.blob.core.windows.net/private'
])test('unapproved artifact redirect is refused before a second request: '+location.split('/')[2],async()=>{
 const f=fixture(()=>new Response(null,{status:302,headers:{location}}));await assert.rejects(f.view.fetch(artifact,options));assert.equal(f.calls.length,1);
});
test('a normal native JSON/App request cannot redirect, even to an artifact host',async()=>{
 const f=fixture(()=>new Response(null,{status:302,headers:{location:signed}}));await assert.rejects(f.view.fetch('https://api.github.com/app',options));assert.equal(f.calls.length,1);
});
test('a signed download cannot redirect again',async()=>{
 const f=fixture(()=>new Response(null,{status:302,headers:{location:signed}}));await assert.rejects(f.view.fetch(artifact,options));assert.equal(f.calls.length,2);
});
for(const status of [301,303,307,308])test('unsupported artifact redirect status '+status+' is held',async()=>{
 const f=fixture(()=>new Response(null,{status,headers:{location:signed}}));await assert.rejects(f.view.fetch(artifact,options));assert.equal(f.calls.length,1);
});
test('an artifact HTML response cannot masquerade as ZIP bytes',async()=>{
 const f=fixture(()=>new Response(PRIVATE,{headers:{'content-type':'text/html'}}));await assert.rejects(f.view.fetch(artifact,options));
});
test('a JSON body declared larger than the fixed response bound is cancelled before reading',async()=>{
 let cancelled=false,reads=0;const f=fixture(()=>({ok:true,status:200,headers:new Headers({'content-type':'application/json','content-length':String(2*1024*1024+1)}),
 body:{cancel:async()=>{cancelled=true;},getReader(){reads++;throw new Error(PRIVATE);}}}));
 await assert.rejects(f.view.fetch(base,options));assert.equal(cancelled,true);assert.equal(reads,0);
});
test('streamed oversize JSON is cancelled before buffering and poisons later views',async()=>{
 let cancelled=false;const f=fixture(()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.enqueue(new Uint8Array([1]));c.close();},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}));
 await assert.rejects(f.view.fetch(base,options));assert.equal(cancelled,true);assert.equal(f.transport.facts().exhausted,true);
 await assert.rejects(f.transport.createView().fetch(base,options));assert.equal(f.calls.length,1);
});
test('aggregate admitted bytes cannot be reset by requesting another view',async()=>{
 const f=fixture(()=>new Response('123',{headers:{'content-type':'application/json'}}),{requests:10,totalBytes:5});
 await f.view.fetch(base,options);await assert.rejects(f.transport.createView().fetch(base,options));assert.equal(f.transport.facts().admittedBytes,3);
 await assert.rejects(f.transport.createView().fetch(base,options));assert.equal(f.calls.length,2);
});
test('both redirect acquisitions count against the network budget',async()=>{
 const f=fixture(()=>new Response(null,{status:302,headers:{location:signed}}),{requests:1,totalBytes:1024});
 await assert.rejects(f.view.fetch(artifact,options));assert.equal(f.calls.length,1);assert.equal(f.transport.facts().fetchAttempts,1);
});
test('errors preserve HTTP status without parsing or leaking private bodies',async()=>{
 let cancelled=false,reads=0;const f=fixture(()=>({ok:false,status:403,headers:new Headers(),body:{cancel:async()=>{cancelled=true;},getReader(){reads++;throw new Error(PRIVATE);}}}));
 const r=await f.view.fetch(base,options);assert.equal(r.status,403);assert.equal(reads,0);assert.equal(cancelled,true);assert.equal(await r.text(),'');
});
test('network exceptions never reveal a signed URL or private provider message',async()=>{
 const f=fixture(()=>{throw new Error(PRIVATE+signed);});await assert.rejects(f.view.fetch(base,options),e=>!String(e).includes(PRIVATE)&&!String(e).includes('sig='));
});
for(const url of ['https://other.invalid/repos/footprintjs/foottrace','https://api.github.com/repos/other/repo','https://api.github.com/repos/footprintjs/foottrace/%2fother','https://user:pass@api.github.com/repos/footprintjs/foottrace'])
 test('an unrelated or encoded API route cannot receive credentials',async()=>{const f=fixture();await assert.rejects(f.view.fetch(url,options));assert.equal(f.calls.length,0);});
test('writes and request bodies are refused before fetch',async()=>{
 const f=fixture();await assert.rejects(f.view.fetch(base,{...options,method:'POST'}));await assert.rejects(f.view.fetch(base,{...options,body:'x'}));assert.equal(f.calls.length,0);
});
test('non-JSON content type is preserved rather than relabelled',async()=>{
 const f=fixture(()=>new Response('{"id":77}',{headers:{'content-type':'text/html'}}));const r=await f.view.fetch(base,options);assert.equal(r.headers.get('content-type'),'text/html');
});

test('exhausting a shared budget aborts signals already issued to all views',async()=>{
 const f=fixture(()=>new Response('123',{headers:{'content-type':'application/json'}}),{requests:10,totalBytes:5});
 await f.view.fetch(base,options);await assert.rejects(f.transport.createView().fetch(base,options));
 assert.equal(f.calls[0].options.signal.aborted,true);assert.equal(f.calls[1].options.signal.aborted,true);
});

test('oversized API URLs are refused before fetch',async()=>{
 const f=fixture();await assert.rejects(f.view.fetch(base+'?x='+'x'.repeat(8192),options));assert.equal(f.calls.length,0);
});
test('an already aborted caller cannot initiate even a credential-bearing GET',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort(PRIVATE);
 await assert.rejects(f.view.fetch(base,{...options,signal:controller.signal}),e=>!String(e).includes(PRIVATE));assert.equal(f.calls.length,0);
});

test('one view cannot borrow a larger global request limit',async()=>{
 const f=fixture(),view=f.transport.createView({requests:1,totalBytes:1024});await view.fetch(base,options);
 await assert.rejects(view.fetch(base,options));assert.equal(f.calls.length,1);assert.equal(f.transport.facts().exhausted,true);
});
test('one view cannot borrow a larger global byte limit',async()=>{
 const f=fixture(()=>new Response('123',{headers:{'content-type':'application/json'}})),view=f.transport.createView({requests:10,totalBytes:5});
 await view.fetch(base,options);await assert.rejects(view.fetch(base,options));assert.equal(f.transport.facts().admittedBytes,3);
});

test('the larger Git blob envelope bound applies only to an exact immutable blob route',async()=>{
 const body=JSON.stringify({content:'A'.repeat(2*1024*1024)}),f=fixture(()=>new Response(body,{headers:{'content-type':'application/json'}}));
 let r;await assert.doesNotReject(async()=>{r=await f.view.fetch(base+'/git/blobs/'+'a'.repeat(40),options);});assert.equal((await r.arrayBuffer()).byteLength,Buffer.byteLength(body));
 await assert.rejects(f.transport.createView().fetch(base+'/actions/runs/500',options));
});
test('oversized declared artifact bytes are refused before reading its body',async()=>{
 let cancelled=false,reads=0;const f=fixture(()=>({ok:true,status:200,headers:new Headers({'content-type':'application/zip','content-length':String(20*1024*1024+1)}),
 body:{cancel:async()=>{cancelled=true;},getReader(){reads++;throw new Error(PRIVATE);}}}));
 await assert.rejects(f.view.fetch(artifact,options));assert.equal(cancelled,true);assert.equal(reads,0);
});
