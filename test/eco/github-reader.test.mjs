import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const path=new URL('../../src/eco/github-reader.mjs',import.meta.url);
const {createEcoReader}=existsSync(path)?await import(path):{};
const reader=options=>{assert.equal(typeof createEcoReader,'function','bounded eco reader feature is required');return createEcoReader(options);};
const repo={resource:'repository',repository:'footprintjs/ci'};
const response=(value={},options={})=>new Response(JSON.stringify(value),{status:200,...options});
test('GET-only fixed routes confine the existing token and redact observation payloads',async()=>{
 const calls=[];const api=reader({githubToken:'existing_read_token',fetcher:async(...args)=>{calls.push(args);return response({id:1,private_note:'secret'});}});
 const r=await api.read(repo);assert.equal(r.data.id,1);assert.equal(calls[0][0],'https://api.github.com/repos/footprintjs/ci');assert.equal(calls[0][1].method,'GET');assert.equal(calls[0][1].redirect,'manual');assert.equal(calls[0][1].headers.authorization,'Bearer existing_read_token');
 assert.doesNotMatch(JSON.stringify(api.observations()),/secret|existing_read_token/);assert.match(r.observation.sha256,/^[a-f0-9]{64}$/);
});
test('arbitrary URLs, paths, methods and foreign-ledger routes fail before any request',async()=>{
 let calls=0;const api=reader({fetcher:async()=>{calls++;return response();}});
 for(const value of [{...repo,repository:'other/ci'},{...repo,repository:'footprintjs/../x'},{...repo,method:'POST'},{...repo,url:'https://evil.test'},{...repo,resource:'publish'},{resource:'ledger',repository:'footprintjs/foottrace',name:'policy',sha:'a'.repeat(40)}])await assert.rejects(api.read(value),{code:'eco-route'});
 assert.equal(calls,0);
});
test('pagination is numbered locally; provider link targets are never followed',async()=>{
 const seen=[];const api=reader({fetcher:async(url)=>{seen.push(url);return response([],{headers:{link:'<https://evil.test/token>; rel="next"'}});}});
 const r=await api.read({resource:'comments',repository:'footprintjs/ci',pullNumber:2,page:1});assert.equal(r.observation.hasNext,true);assert.equal(seen.length,1);assert.match(seen[0],/issues\/2\/comments\?per_page=100&page=1$/);
 await assert.rejects(api.read({resource:'comments',repository:'footprintjs/ci',pullNumber:2,page:9}),{code:'eco-route'});
});
test('redirects, missing/failed responses and malformed JSON remain unknown read failures',async()=>{
 for(const fetcher of [async()=>new Response(null,{status:302,headers:{location:'https://evil.test'}}),async()=>new Response('private',{status:404}),async()=>new Response('private',{status:429}),async()=>new Response('{bad'),async()=>{throw Error('token /Users/private');}]){
  const api=reader({fetcher});await assert.rejects(api.read(repo),error=>/^eco-(redirect|http|json|transport)$/.test(error.code)&&!error.message.includes('private'));
 }
});
test('bounded streaming rejects size claims and cancels actual overflow',async()=>{
 let cancelled=false;const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(80));},cancel(){cancelled=true;}});
 const api=reader({maxResponseBytes:64,fetcher:async()=>new Response(body)});await assert.rejects(api.read(repo),{code:'eco-response-limit'});assert(cancelled);
 const declared=reader({maxResponseBytes:64,fetcher:async()=>response({}, {headers:{'content-length':'65'}})});await assert.rejects(declared.read(repo),{code:'eco-response-limit'});
});
test('request and cumulative byte budgets are finite and cannot be widened',async()=>{
 const api=reader({maxRequests:1,fetcher:async()=>response({})});await api.read(repo);await assert.rejects(api.read(repo),{code:'eco-request-limit'});
 const bytes=reader({maxBytes:10,fetcher:async()=>response('12345')});await bytes.read(repo);await assert.rejects(bytes.read(repo),{code:'eco-response-limit'});
 for(const options of [{maxRequests:100000},{maxBytes:Infinity},{maxResponseBytes:2**30},{githubToken:'token\nprivate'}])assert.throws(()=>reader(options),{code:'eco-options'});
});
test('pinned ledger and commit routes cannot use mutable refs or executable paths',async()=>{
 const seen=[];const api=reader({fetcher:async(url)=>{seen.push(url);return response({});}});const sha='a'.repeat(40);
 await api.read({resource:'ledger',repository:'footprintjs/ci',name:'policy',sha});await api.read({resource:'commit',repository:'footprintjs/ci',sha});
 assert.match(seen[0],new RegExp('/contents/ledger/policy.json\\?ref='+sha+'$'));assert.match(seen[1],new RegExp('/git/commits/'+sha+'$'));
 await assert.rejects(api.read({resource:'ledger',repository:'footprintjs/ci',name:'../evil',sha}),{code:'eco-route'});await assert.rejects(api.read({resource:'commit',repository:'footprintjs/ci',sha:'main'}),{code:'eco-route'});
});

test('request facts are detached before awaiting a response, never reread from caller objects',async()=>{
 const target={...repo};const api=reader({fetcher:async()=>{target.repository='secret /Users/private';target.resource='private token';return response({});}});
 const r=await api.read(target);assert.equal(r.observation.repository,'footprintjs/ci');assert.equal(r.observation.resource,'repository');assert.doesNotMatch(JSON.stringify(api.observations()),/private|token/);
});
test('exhausted byte allowance stops later fetches, including after a failed read',async()=>{
 let calls=0;const api=reader({maxBytes:4,fetcher:async()=>{calls++;return response('oversize');}});
 await assert.rejects(api.read(repo),{code:'eco-response-limit'});await assert.rejects(api.read(repo),{code:'eco-response-limit'});assert.equal(calls,1);
});

test('refused handoffs retain bounded static evidence with explicit omission accounting',async()=>{
 const api=reader({maxRequests:1,fetcher:async()=>new Response('sensitive body',{status:404})});
 for(let i=0;i<70;i++)await assert.rejects(api.read(repo));
 const observations=api.observations();assert.equal(observations.length,65);assert.equal(observations[0].status,404);assert.equal(observations[0].reason,'eco-http');assert.equal(api.totals().requests,1);assert.equal(api.totals().omittedObservations,5);assert.doesNotMatch(JSON.stringify(observations),/sensitive body/);
});
