import test from 'node:test';
import assert from 'node:assert/strict';
import * as transport from '../../src/propose/foottrace-transport.mjs';
const repository={id:123,full_name:'footprintjs/foottrace'};
const identity={slug:'offline-release',clientId:'offline-client',jwt:'offline_ephemeral_app_jwt'};
function fixture(){
 assert.equal(typeof transport.createFoottraceInspectionTransport,'function','inspection has no separate read-only native credential owner');
 const calls=[],owner=transport.createFoottraceInspectionTransport({repository,token:'offline_read_token',appIdentity:identity,
  fetcher:async(url,options)=>{
   calls.push({url,options});
   return Response.json(new URL(url).pathname==='/app'?{id:700,slug:identity.slug,client_id:identity.clientId,private:'PRIVATE-IDENTITY-BODY'}:{id:123,full_name:repository.full_name,permissions:{push:false}});
  }});
 return {owner,calls,port:transport.foottraceTransportPort(owner)};
}
test('read-only owner uses only ephemeral App identity for its exact configured /app read',async()=>{
 const f=fixture();
 const result=await f.port.api('GET','/apps/'+identity.slug);
 assert.deepEqual(result.data,{id:700,slug:identity.slug,client_id:identity.clientId});assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://api.github.com/app');
 assert.equal(f.calls[0].options.headers.authorization,'Bearer '+identity.jwt);
 await f.port.api('GET','/repos/'+repository.full_name);
 assert.equal(f.calls[1].options.headers.authorization,'Bearer offline_read_token');
 assert.equal(JSON.stringify(f.owner).includes(identity.jwt),false);assert.equal(JSON.stringify(f.port.facts()).includes(identity.jwt),false);
});
test('the actual read-only captured owner cannot derive the exact metadata writer facet',async()=>{
 const f=fixture();assert.throws(()=>transport.foottraceMetadataPatchPort(f.owner,{pullNumber:43,desired:{title:'Release 1.11.1',body:'notes'}}));
 await assert.rejects(f.port.api('PATCH','/repos/'+repository.full_name+'/pulls/43',{title:'x',body:'y'}));assert.equal(f.calls.length,0);
});
test('inspection refuses a long-lived private-key field instead of retaining it behind an env cleanup claim',()=>{
 assert.equal(typeof transport.createFoottraceInspectionTransport,'function');
 assert.throws(()=>transport.createFoottraceInspectionTransport({repository,token:'offline_read_token',appIdentity:{...identity,privateKey:'PRIVATE-NOT-ALLOWED'},fetcher:()=>assert.fail('no IO')}));
});

test('the shared writer-capable IO profile also refuses long-lived key input',()=>{
 assert.throws(()=>transport.createFoottraceTransport({repository,token:'offline_write_token',appIdentity:{slug:identity.slug,clientId:identity.clientId,privateKey:'PRIVATE-NOT-ALLOWED'},fetcher:()=>assert.fail('no IO')}));
});

for(const [label,route,method,body] of [
 ['other App','/apps/other-app','GET',undefined],['App write','/apps/offline-release','POST',{}],
 ['App body','/apps/offline-release','GET',{}],['raw App','/app','GET',undefined],
 ['installation mint','/app/installations/1/access_tokens','POST',{}]
])test('inspection identity refuses '+label+' before any credential-bearing IO',async()=>{
 const f=fixture();await assert.rejects(f.port.api(method,route,body));assert.equal(f.calls.length,0);
});
for(const [label,response] of [
 ['denied',()=>new Response('PRIVATE-IDENTITY',{status:403})],
 ['wrong App',()=>Response.json({id:700,slug:'other',client_id:identity.clientId})],
 ['wrong client',()=>Response.json({id:700,slug:identity.slug,client_id:'other'})],
 ['wrong id',()=>Response.json({id:'700',slug:identity.slug,client_id:identity.clientId})],
 ['bad JSON',()=>new Response('PRIVATE-IDENTITY',{headers:{'content-type':'application/json'}})],
 ['wrong MIME',()=>new Response('{}',{headers:{'content-type':'text/html'}})]
])test('inspection '+label+' App identity remains unavailable without private response disclosure',async()=>{
 const owner=transport.createFoottraceInspectionTransport({repository,token:'offline_read_token',appIdentity:identity,fetcher:async()=>response()});
 await assert.rejects(transport.foottraceTransportPort(owner).api('GET','/apps/'+identity.slug),e=>!String(e).includes('PRIVATE-IDENTITY'));
});
test('both profiles reject unsafe or missing identity JWT bytes before any request',()=>{
 for(const create of [transport.createFoottraceTransport,transport.createFoottraceInspectionTransport])
  for(const jwt of ['',undefined,'x y','x\n','é','x'.repeat(8193)])
   assert.throws(()=>create({repository,token:'offline_token',appIdentity:{slug:identity.slug,clientId:identity.clientId,jwt},fetcher:()=>assert.fail('no IO')}));
});
test('serialized read/write profile labels cannot select or reconstruct the private owner',()=>{
 for(const label of ['captured-native-read-owner','captured-native-http-owner']){
  assert.throws(()=>transport.foottraceTransportPort({scope:label,inspectionReadOnly:false}));
  assert.throws(()=>transport.foottraceMetadataPatchPort({scope:label,inspectionReadOnly:false},{pullNumber:43,desired:{title:'x',body:'y'}}));
 }
});
