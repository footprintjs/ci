import test from 'node:test';
import assert from 'node:assert/strict';
import * as nativeTransport from '../../src/propose/foottrace-transport.mjs';
const repository={id:123,full_name:'footprintjs/foottrace'},route='/repos/footprintjs/foottrace/pulls/43';
const desired={title:'Release 1.11.1',body:'Exact computed notes'};
function fixture({uncertain=false,limits}={}){
 const calls=[],transport=nativeTransport.createFoottraceTransport({repository,token:'offline_sealed_owner_token',
  appIdentity:{slug:'offline-release',clientId:'offline-client',jwt:'offline_unused_identity_jwt'},limits,
  fetcher:async(url,options)=>{calls.push({url,options});if(uncertain&&options.method==='PATCH')throw new Error('PRIVATE-UNCERTAINTY');
   return new Response('{"number":43}',{headers:{'content-type':'application/json'}});}});
 assert.equal(typeof nativeTransport.foottraceMetadataPatchPort,'function','same sealed owner has no closed metadata PATCH facet');
 const writer=input=>nativeTransport.foottraceMetadataPatchPort(transport,input??{pullNumber:43,desired});
 return {transport,calls,writer,read:nativeTransport.foottraceTransportPort(transport)};
}
test('same native owner supplies captured credential to one closed exact metadata PATCH',async()=>{
 const f=fixture(),port=f.writer();assert.equal(port.authorized,false);assert.equal(port.scope,'exact-metadata-io-only');
 assert.equal(Object.hasOwn(port,'api'),false);assert.equal(Object.hasOwn(port,'fetch'),false);
 let result;await assert.doesNotReject(async()=>{result=await port.setExact();});
 assert.deepEqual(result,{data:{number:43}});assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'https://api.github.com'+route);
 assert.equal(f.calls[0].options.headers.authorization,'Bearer offline_sealed_owner_token');
 assert.equal(f.calls[0].options.body,JSON.stringify(desired));assert.equal(f.calls[0].options.method,'PATCH');
 assert.equal(JSON.stringify(port).includes('offline_sealed_owner_token'),false);
 await f.read.api('GET',route);assert.equal(f.calls[1].options.headers.authorization,f.calls[0].options.headers.authorization);
 assert.equal(f.read.transportFacts().fetchAttempts,2);
});
test('the existing native read facet rejects PATCH without using its credential',async()=>{
 const f=fixture();await assert.rejects(f.read.api('PATCH',route,desired));assert.equal(f.calls.length,0);
});
test('one uncertain native PATCH cannot be repeated through a newly derived facet; native GET verification remains',async()=>{
 const f=fixture({uncertain:true});await assert.rejects(f.writer().setExact(),e=>!String(e).includes('PRIVATE-UNCERTAINTY'));
 await assert.rejects(f.writer().setExact());assert.equal(f.calls.length,1);
 assert.deepEqual(await f.read.api('GET',route),{data:{number:43}});assert.equal(f.calls.length,2);
});
test('same captured owner budget cannot be reset across native read and writer facets',async()=>{
 const f=fixture({limits:{requests:1,totalBytes:1024}});await f.read.api('GET',route);
 await assert.rejects(f.writer().setExact());assert.equal(f.calls.length,1);assert.equal(f.read.transportFacts().exhausted,true);
});
test('bound desired metadata is owned and canonical even if caller mutates or reverses its input keys',async()=>{
 const f=fixture(),input={body:desired.body,title:desired.title},port=f.writer({pullNumber:43,desired:input});
 input.body='changed';await port.setExact();assert.equal(f.calls[0].options.body,JSON.stringify(desired));
});
test('serialized flags cannot reconstruct either private transport facet',()=>{
 assert.equal(typeof nativeTransport.foottraceMetadataPatchPort,'function');
 assert.throws(()=>nativeTransport.foottraceMetadataPatchPort(JSON.parse('{"readOnly":true}'),{pullNumber:43,desired}));
});
test('unexpected binding fields and getters are rejected without provider IO',()=>{
 const f=fixture();assert.throws(()=>f.writer({pullNumber:43,desired,authority:true}));
 let reads=0;assert.throws(()=>f.writer({pullNumber:43,get desired(){reads++;return desired;}}));
 assert.equal(reads,0);assert.equal(f.calls.length,0);
});

test('captured owner does not label its IO capabilities as read-only; each facet owns that boundary',()=>{
 const f=fixture();assert.equal(Object.hasOwn(f.transport,'readOnly'),false);
 assert.equal(f.transport.scope,'captured-native-http-owner');assert.equal(Object.isFrozen(f.transport),true);
});
