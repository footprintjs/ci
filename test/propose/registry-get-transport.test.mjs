import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitHubTransport} from '../../src/propose/github-transport.mjs';
import native from '../../src/guards/release-github.cjs';
const repo={id:123,full_name:'footprintjs/foottrace'},base='https://registry.npmjs.org/foottrace',api='https://api.github.com/repos/'+repo.full_name;
const privateValue='PRIVATE-REGISTRY-TRANSPORT',credentials={authorization:'Bearer '+privateValue,cookie:privateValue,'x-github-api-version':'2022-11-28'};
function fixture(reply=()=>new Response('{"name":"foottrace","version":"1.11.0","dist":{"integrity":"sha512-Zm9v"}}',{headers:{'content-type':'application/json'}}),limits) {
 const calls=[],transport=createGitHubTransport({repository:repo,limits,fetcher:async(u,o)=>{calls.push({url:u,options:o});return reply(u,o,calls.length);}});
 return {transport,view:transport.createRegistryView({packageName:'foottrace',version:'1.11.0'}),calls};
}
test('native registry metadata GET is version-bound, anonymous and shares finite transport facts',async()=>{
 const f=fixture(),r=await assert.doesNotReject(()=>native.registryVersion('1.11.0',f.view.fetch));
 const actual=fixture(()=>new Response(JSON.stringify({name:'foottrace',version:'1.11.0',dist:{integrity:'sha512-Zm9v',shasum:'a'.repeat(40),tarball:base+'/-/foottrace-1.11.0.tgz'}}),{headers:{'content-type':'application/json'}}));
 const metadata=await native.registryVersion('1.11.0',actual.view.fetch);assert.equal(metadata.version,'1.11.0');
 assert.equal(actual.calls.length,1);assert.equal(actual.calls[0].options.method,'GET');assert.equal(actual.calls[0].options.credentials,'omit');
 assert.equal(actual.calls[0].options.redirect,'error');assert.equal(actual.transport.facts().fetchAttempts,1);
});
test('caller credentials and arbitrary headers are never sent to the registry',async()=>{
 const f=fixture();await f.view.fetch(base+'/1.11.0',{method:'GET',headers:credentials,credentials:'include',redirect:'follow'});
 const headers=new Headers(f.calls[0].options.headers);assert.deepEqual([...headers.keys()],['accept']);
 assert.equal(headers.get('accept'),'application/json');assert.equal(f.calls[0].options.credentials,'omit');assert.equal(f.calls[0].options.redirect,'error');
 assert.equal(JSON.stringify(f.transport.facts()).includes(privateValue),false);
});
test('exact version tarball is anonymous bytes, not a GitHub artifact redirect or JSON envelope',async()=>{
 const f=fixture(()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'application/octet-stream'}}));
 const r=await assert.doesNotReject(()=>f.view.fetch(base+'/-/foottrace-1.11.0.tgz',{headers:credentials}));
 const g=fixture(()=>new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'application/gzip'}})),reply=await g.view.fetch(base+'/-/foottrace-1.11.0.tgz');
 assert.deepEqual([...new Uint8Array(await reply.arrayBuffer())],[1,2,3]);assert.equal(new Headers(g.calls[0].options.headers).has('authorization'),false);
 assert.equal(new Headers(g.calls[0].options.headers).get('accept'),'application/octet-stream');
});
for(const url of [
 api,base+'/1.10.0',base+'/-/foottrace-1.10.0.tgz','https://registry.npmjs.org/other/1.11.0',
 base+'/1.11.0?token='+privateValue,base+'/1.11.0#fragment','https://user:pass@registry.npmjs.org/foottrace/1.11.0',
 'http://registry.npmjs.org/foottrace/1.11.0','https://registry.npmjs.org.evil.invalid/foottrace/1.11.0',
])test('registry view refuses a URL outside its exact package/version routes: '+url.split('/').at(-1).split('?')[0],async()=>{
 const f=fixture();await assert.rejects(f.view.fetch(url));assert.equal(f.calls.length,0);
});
test('latest is read-only metadata for the same declared package',async()=>{
 const f=fixture(),r=await f.view.fetch(base+'/latest');assert.equal((await r.json()).name,'foottrace');assert.equal(f.calls.length,1);
});
test('API view cannot route a credential-bearing request to the registry',async()=>{
 const f=fixture();await assert.rejects(f.transport.createView().fetch(base+'/1.11.0',{method:'GET',headers:credentials}));assert.equal(f.calls.length,0);
});
for(const status of [301,302,307,308])test('registry redirect '+status+' is refused without following Location',async()=>{
 const f=fixture(()=>new Response(null,{status,headers:{location:'https://synthetic.blob.core.windows.net/private?sig='+privateValue}}));
 await assert.rejects(f.view.fetch(base+'/1.11.0'));assert.equal(f.calls.length,1);
});
for(const [suffix,contentType] of [['/1.11.0','text/html'],['/-/foottrace-1.11.0.tgz','text/html']])
 test('registry content-type '+contentType+' cannot replace '+suffix,async()=>{
  const f=fixture(()=>new Response('private html',{headers:{'content-type':contentType}}));await assert.rejects(f.view.fetch(base+suffix));
 });
test('version metadata 404 preserves only status and discards the provider body',async()=>{
 let cancelled=false;const f=fixture(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{status:404}));
 const r=await f.view.fetch(base+'/1.11.0');assert.equal(r.status,404);assert.equal(await r.text(),'');assert.equal(cancelled,true);assert.equal(f.transport.facts().admittedBytes,0);
});
test('registry declared tarball budget is sixteen MiB before stream acquisition',async()=>{
 let pulled=0,cancelled=false;const f=fixture(()=>new Response(new ReadableStream({pull(c){pulled++;c.enqueue(new Uint8Array([1]));},cancel(){cancelled=true;}}),
 {headers:{'content-type':'application/gzip','content-length':String(16*1024*1024+1)}}));
 await assert.rejects(f.view.fetch(base+'/-/foottrace-1.11.0.tgz'));assert.equal(cancelled,true);assert.ok(pulled<=1);assert.equal(f.transport.facts().exhausted,true);
});
test('registry streaming metadata budget is enforced before copying overflow bytes',async()=>{
 let cancelled=false;const f=fixture(()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}));
 await assert.rejects(f.view.fetch(base+'/1.11.0'));assert.equal(cancelled,true);assert.equal(f.transport.facts().admittedBytes,0);
});
test('registry and API requests cannot reset a shared exhausted request budget',async()=>{
 const f=fixture(undefined,{requests:1,totalBytes:1024});await assert.doesNotReject(()=>f.transport.createView().fetch(api,{method:'GET'}));
 await assert.rejects(f.view.fetch(base+'/1.11.0'));assert.equal(f.calls.length,1);assert.equal(f.transport.facts().exhausted,true);
 await assert.rejects(f.transport.createRegistryView({packageName:'foottrace',version:'1.11.0'}).fetch(base+'/latest'));assert.equal(f.calls.length,1);
});
test('registry and API streams consume the same admitted-byte budget',async()=>{
 const f=fixture(()=>new Response('123456789',{headers:{'content-type':'application/json'}}),{requests:10,totalBytes:16});
 await assert.doesNotReject(()=>f.transport.createView().fetch(api,{method:'GET'}));await assert.rejects(f.view.fetch(base+'/1.11.0'));
 assert.equal(f.transport.facts().admittedBytes,9);assert.equal(f.transport.facts().exhausted,true);
});
test('an already aborted native registry signal performs no request',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort(new Error(privateValue));
 await assert.rejects(f.view.fetch(base+'/1.11.0',{signal:controller.signal}));assert.equal(f.calls.length,0);
});
for(const options of [{method:'POST'},{body:'private-body'}])test('registry view refuses effectful request options',async()=>{
 const f=fixture();await assert.rejects(f.view.fetch(base+'/1.11.0',options));assert.equal(f.calls.length,0);
});
test('provider exceptions contain no raw registry body or supplied error in the public rejection',async()=>{
 const f=fixture(()=>{throw new Error(privateValue);});await assert.rejects(f.view.fetch(base+'/1.11.0'),e=>!String(e).includes(privateValue));
});

test('registry view local limits are admitted without resetting the global authority',async()=>{
 const f=fixture(),view=f.transport.createRegistryView({packageName:'foottrace',version:'1.11.0',limits:{requests:1,totalBytes:1024}});
 await assert.doesNotReject(()=>view.fetch(base+'/1.11.0'));await assert.rejects(view.fetch(base+'/latest'));assert.equal(f.calls.length,1);assert.equal(f.transport.facts().exhausted,true);
});
for(const profile of [
 {packageName:'foottrace/other',version:'1.11.0'},{packageName:'foottrace',version:'../latest'},
 {packageName:'foottrace',version:'1.11.0',limits:{requests:4097,totalBytes:1024}},
 {packageName:'foottrace',version:'1.11.0',unexpected:'private'},
])test('invalid anonymous registry profile is refused before acquisition',()=>{
 const f=fixture();assert.throws(()=>f.transport.createRegistryView(profile));assert.equal(f.calls.length,0);
});

test('registry exhaustion aborts an already issued native API signal from the same transport',async()=>{
 let aborted=false,release;const f=fixture((u,o,n)=>n>1?new Response('{}',{headers:{'content-type':'application/json'}}):new Promise((resolve,reject)=>{
  release=()=>resolve(new Response('{}',{headers:{'content-type':'application/json'}}));
  o.signal.addEventListener('abort',()=>{aborted=true;reject(new Error(privateValue));},{once:true});
 }),{requests:1,totalBytes:1024});
 const issued=f.transport.createView().fetch(api,{method:'GET'});let rejected=false;
 try{await f.view.fetch(base+'/1.11.0');}catch{rejected=true;}
 const abortedBeforeRelease=aborted;release();await Promise.allSettled([issued]);
 assert.equal(rejected,true);assert.equal(abortedBeforeRelease,true);assert.equal(f.calls.length,1);
});
