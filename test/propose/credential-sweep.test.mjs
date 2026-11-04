import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createReadOnlyTransport} from '../../src/github-readonly.mjs';
import {createEcoReader} from '../../src/eco/github-reader.mjs';
const {main}=createRequire(import.meta.url)('../../bin/caller-preflight.cjs');
const pin='a'.repeat(40),sourceSha='b'.repeat(40),token='ghs_700_fake_header.'+'synthetic-payload_'.repeat(35)+'.fake-signature';
const caller=JSON.stringify({name:'publish',on:{push:{branches:['main']},workflow_dispatch:{}},permissions:{contents:'read'},
 jobs:{release:{uses:'footprintjs/ci/.github/workflows/release.yml@'+pin,with:{tool_sha:pin,source_sha:'${{ github.sha }}',mode:'shadow'}}}});
test('shadow transport and eco reader accept the same opaque existing credential without recording it',async()=>{
 for(const kind of ['shadow','eco']){
  await assert.doesNotReject(async()=>{
   let calls=0;const fetcher=async(url,options)=>{calls++;assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);return Response.json({id:123,full_name:'footprintjs/foottrace'});};
   const reader=kind==='shadow'?createReadOnlyTransport({githubToken:token,fetcher}):createEcoReader({githubToken:token,fetcher});
   if(kind==='shadow')await reader.api('GET','/repos/footprintjs/foottrace');else await reader.read({resource:'repository',repository:'footprintjs/foottrace'});
   assert.equal(calls,1);assert.equal(JSON.stringify(reader.observations()).includes(token),false);
  });
 }
});
test('dependency-free pre-checkout caller admission accepts opaque credentials without parsing their token format',async()=>{
 await assert.doesNotReject(()=>main({TOOL_SHA:pin,SOURCE_SHA:sourceSha,WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main',GH_TOKEN:token},
  async(url,options)=>{assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);return Response.json({
   type:'file',path:'.github/workflows/publish.yml',encoding:'base64',size:Buffer.byteLength(caller),content:Buffer.from(caller).toString('base64')});}));
});
test('all read adapters and dependency-free caller reject unsafe credential bytes before any fetch',async()=>{
 for(const credential of ['',null,{},'a b','a\n','a\r','a\t','a\0',String.fromCharCode(127),'é','a'.repeat(8193)]){
  let calls=0;const fetcher=async()=>{calls++;throw new Error('unexpected');};
  assert.throws(()=>createReadOnlyTransport({githubToken:credential,fetcher}));
  assert.throws(()=>createEcoReader({githubToken:credential,fetcher}));
  await assert.rejects(main({TOOL_SHA:pin,SOURCE_SHA:sourceSha,WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main',GH_TOKEN:credential},fetcher));
  assert.equal(calls,0);
 }
});
