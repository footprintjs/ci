import test from 'node:test';
import assert from 'node:assert/strict';
import * as transport from '../../src/propose/foottrace-transport.mjs';
import {identityFactsFixture} from './identity-facts-fixture.mjs';
const repository={id:123,full_name:'footprintjs/foottrace'};
const identity={slug:'agentfootprint-release',clientId:'offline-client',facts:identityFactsFixture()};
function fixture(limits){
 const calls=[],owner=transport.createFoottraceInspectionTransport({repository,token:'offline_read_token',appIdentity:identity,limits,
  fetcher:async(url,options)=>{
   calls.push({url,options});assert.equal(new Headers(options.headers).get('authorization'),'Bearer offline_read_token');
   assert.equal(new URL(url).pathname,'/repos/'+repository.full_name);
   return Response.json({id:123,full_name:repository.full_name,permissions:{push:false}});
  }});
 return {owner,calls,port:transport.foottraceTransportPort(owner)};
}
test('read-only owner serves cached key-holder App facts without private HTTP or fresh-authentication claim',async()=>{
 const f=fixture(),result=await f.port.api('GET','/apps/'+identity.slug);
 assert.equal(result.data.id,5533048);assert.equal(result.data.slug,identity.slug);assert.equal(f.calls.length,0);
 assert.equal(f.port.identityObservation,'cached-key-holder-facts');
 await f.port.api('GET','/repos/'+repository.full_name);assert.equal(f.calls.length,1);
});
test('actual read-only owner cannot derive any exact metadata writer facet',async()=>{
 const f=fixture();assert.throws(()=>transport.foottraceMetadataPatchPort(f.owner,{pullNumber:43,desired:{title:'Release 1.11.1',body:'notes'}}));
 await assert.rejects(f.port.api('PATCH','/repos/'+repository.full_name+'/pulls/43',{title:'x',body:'y'}));assert.equal(f.calls.length,0);
});
for(const create of [transport.createFoottraceInspectionTransport,transport.createFoottraceTransport])
 for(const key of ['privateKey','jwt'])test(create.name+' refuses '+key+' even alongside matching facts',()=>{
  assert.throws(()=>create({repository,token:'offline_token',appIdentity:{...identity,[key]:'PRIVATE-NOT-ALLOWED'},fetcher:()=>assert.fail('no IO')}));
 });
for(const [label,route,method,body] of [
 ['other App','/apps/other-app','GET',undefined],['App write','/apps/agentfootprint-release','POST',{}],
 ['App write without body','/apps/agentfootprint-release','POST',undefined],
 ['App body','/apps/agentfootprint-release','GET',{}],['raw App','/app','GET',undefined],
 ['installation mint','/app/installations/1/access_tokens','POST',{}]
])test('cached identity adapter refuses '+label+' before IO',async()=>{
 const f=fixture();await assert.rejects(f.port.api(method,route,body));assert.equal(f.calls.length,0);
});
test('cached facts do not reset or enlarge the installation-token request bank',async()=>{
 const f=fixture({requests:1,totalBytes:1024*1024});
 await f.port.api('GET','/repos/'+repository.full_name);
 for(let i=0;i<3;i++)await f.port.api('GET','/apps/'+identity.slug);
 await assert.rejects(f.port.api('GET','/repos/'+repository.full_name));assert.equal(f.calls.length,1);
});
test('serialized read/write profile labels remain unable to select or reconstruct a private owner',()=>{
 for(const label of ['captured-native-read-owner','captured-native-http-owner']){
  assert.throws(()=>transport.foottraceTransportPort({scope:label,inspectionReadOnly:false}));
  assert.throws(()=>transport.foottraceMetadataPatchPort({scope:label,inspectionReadOnly:false},{pullNumber:43,desired:{title:'x',body:'y'}}));
 }
});
