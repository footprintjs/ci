import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import * as transport from '../../src/propose/foottrace-transport.mjs';
import * as invocation from '../../src/propose/proposal-invocation.mjs';
const path=new URL('../../src/propose/app-identity-facts.mjs',import.meta.url);
const factsModule=existsSync(path)?await import(path):{};
const repository={id:123,full_name:'footprintjs/foottrace'},sha='a'.repeat(40);
const context={repository,sha,runId:500,runAttempt:1,eventName:'push',ref:'refs/heads/main'};
const options={repository,slug:'agentfootprint-release',clientId:'offline-client',context};
const sample=()=>({schemaVersion:1,verified:true,appId:5533048,appSlug:'agentfootprint-release',clientId:'offline-client',
 ownerId:266183199,ownerLogin:'footprintjs',ownerType:'Organization',repositoryId:123,sourceSha:sha,runId:500,runAttempt:1});
function bind(value,expected=options){
 assert.equal(typeof factsModule.bindAppIdentityFacts,'function','closed S1b identity-facts binder is missing');
 return factsModule.bindAppIdentityFacts(value,expected);
}
function parse(text){
 assert.equal(typeof factsModule.parseAppIdentityFacts,'function','bounded canonical identity-facts parser is missing');
 return factsModule.parseAppIdentityFacts(text,options);
}
test('exact isolated-helper facts bind only owned cached input, never fresh App authentication',()=>{
 const f=sample(),value=bind(f);assert.deepEqual(value,f);assert.equal(Object.isFrozen(value),true);
 f.appId=1;assert.equal(value.appId,5533048);assert.deepEqual(parse(JSON.stringify(sample())),sample());
});
for(const [key,value] of [
 ['schemaVersion','1'],['schemaVersion',2],['verified',false],['verified','true'],['appId',1],
 ['appSlug','other'],['clientId','other'],['ownerId',1],['ownerLogin','other'],['ownerType','User'],
 ['repositoryId',321],['sourceSha','b'.repeat(40)],['runId',501],['runAttempt',2],['runAttempt',9]
])test('facts refuse wrong '+key+' '+String(value).slice(0,12),()=>{
 const f=sample();f[key]=value;assert.throws(()=>bind(f));
});
for(const key of ['jwt','privateKey','token','unknown'])test('facts refuse extra '+key+' without a legacy fallback',()=>{
 const f=sample();f[key]='PRIVATE';assert.throws(()=>bind(f));
});
test('facts refuse absent properties, accessors and class data without reading a getter',()=>{
 const missing=sample();delete missing.verified;assert.throws(()=>bind(missing));
 let reads=0;const accessor=sample();Object.defineProperty(accessor,'appId',{enumerable:true,get(){reads++;throw new Error('PRIVATE');}});
 assert.throws(()=>bind(accessor));assert.equal(reads,0);
 class Fact{}assert.throws(()=>bind(Object.assign(new Fact(),sample())));
});
test('fact text is bounded before parsing and duplicate/noncanonical JSON is refused',()=>{
 const original=JSON.parse;let calls=0;
 try{JSON.parse=(...args)=>{calls++;return original(...args);};assert.throws(()=>parse('x'.repeat(4097)));assert.equal(calls,0);}
 finally{JSON.parse=original;}
 assert.throws(()=>parse(' '+JSON.stringify(sample())));
 assert.throws(()=>parse(JSON.stringify(sample()).replace('"verified":true','"verified":true,"verified":true')));
});
test('both shared profiles accept fact-only identity and serve logical App facts with ZERO private requests',async()=>{
 for(const create of [transport.createFoottraceInspectionTransport,transport.createFoottraceTransport]){
  let calls=0,owner;assert.doesNotThrow(()=>{owner=create({repository,token:'offline_read_token',
   appIdentity:{slug:options.slug,clientId:options.clientId,facts:sample()},fetcher:async()=>{calls++;assert.fail('No private App request');}});});
  const port=transport.foottraceTransportPort(owner),value=await port.api('GET','/apps/'+options.slug);
  assert.equal(value.data.id,5533048);assert.equal(value.data.slug,options.slug);assert.equal(calls,0);
  assert.equal(port.identityFacts.sourceSha,sha);
  await assert.rejects(port.api('POST','/app/installations/1/access_tokens',{}));assert.equal(calls,0);
 }
});
test('both profiles reject old JWT identity input outright',()=>{
 for(const create of [transport.createFoottraceInspectionTransport,transport.createFoottraceTransport])
  assert.throws(()=>create({repository,token:'offline_read_token',appIdentity:{slug:options.slug,clientId:options.clientId,jwt:'old_wide_jwt'},fetcher:()=>assert.fail('No IO')}));
});
function env(){
 return {GITHUB_ACTIONS:'true',GITHUB_JOB:'proposal',REPO_ID:'123',REPO_NAME:repository.full_name,SOURCE_SHA:sha,
  SOURCE_REF:'refs/heads/main',EVENT_NAME:'push',RUN_ID:'500',RUN_ATTEMPT:'1',GITHUB_REPOSITORY_ID:'123',
  GITHUB_REPOSITORY:repository.full_name,GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha,GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'push',GITHUB_RUN_ID:'500',GITHUB_RUN_ATTEMPT:'1',
  GITHUB_WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main',
  TOOL_SHA:'c'.repeat(40),ARTIFACT_ID:'800',APP_SLUG:options.slug,APP_CLIENT_ID:options.clientId,
  APP_IDENTITY_FACTS:JSON.stringify(sample()),GH_TOKEN:'offline_read_token'};
}
test('both trusted CODE captures bind exact current facts and erase facts/credentials before any IO',()=>{
 for(const capture of [invocation.captureFoottraceProposalInvocation,invocation.captureFoottraceMetadataWriterInvocation]){
  const e=env();let c;assert.doesNotThrow(()=>{c=capture({env:e,fetcher:()=>assert.fail('No IO')});});
  assert.equal(c.context.sha,sha);
  for(const name of ['APP_IDENTITY_FACTS','APP_PRIVATE_KEY','APP_JWT','GH_TOKEN'])assert.equal(Object.hasOwn(e,name),false);
 }
});
test('legacy JWT environment is rejected even alongside matching facts and erased on failure',()=>{
 const e=env();e.APP_JWT='old_wide_jwt';
 assert.throws(()=>invocation.captureFoottraceProposalInvocation({env:e,fetcher:()=>assert.fail('No IO')}));
 for(const name of ['APP_IDENTITY_FACTS','APP_PRIVATE_KEY','APP_JWT','GH_TOKEN'])assert.equal(Object.hasOwn(e,name),false);
});
