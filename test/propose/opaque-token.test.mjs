import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoottraceTransport,foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
const repository={id:123,full_name:'footprintjs/foottrace'};
const identity={slug:'release-app',clientId:'public-client-id',jwt:'offline_unused_identity_jwt'};
test('opaque installation credential punctuation and a long stateless-shaped value reach only the bound API header unchanged',async()=>{
 for(const token of ['ghs_fixtureLegacy123','ghs_700_eyJ0eXAiOiJKV1QifQ.'+'a-b_c'.repeat(100)+'.synthetic_signature','opaque.+/~=_-token']){
  let count=0;
  await assert.doesNotReject(async()=>{
   const transport=createFoottraceTransport({repository,token,appIdentity:identity,fetcher:async(url,options)=>{
    count++;assert.equal(url,'https://api.github.com/repos/footprintjs/foottrace');
    assert.equal(new Headers(options.headers).get('authorization'),'Bearer '+token);assert.equal(options.method,'GET');
    return Response.json(repository);
   }}),port=foottraceTransportPort(transport);
   await port.api('GET','/repos/footprintjs/foottrace');assert.equal(count,1);
   assert.equal(JSON.stringify(port.transportFacts()).includes(token),false);
   assert.equal(JSON.stringify(transport).includes(token),false);
  });
 }
});
test('empty, whitespace, control, non-ASCII and over-bound opaque credentials fail before any fetch',()=>{
 let requests=0;
 for(const token of ['',null,{},' ','abc ','abc\n','abc\r','abc\t','ab\0c','abc'+String.fromCharCode(127),'aé','a'.repeat(8193)]){
  assert.throws(()=>createFoottraceTransport({repository,token,appIdentity:identity,fetcher:()=>{requests++;throw new Error('unexpected');}}));
 }
 assert.equal(requests,0);
});
