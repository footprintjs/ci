import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeHttpFixture} from './native-http-provider-fixture.mjs';
import {createFoottraceTransport,foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
import {createFoottraceLineageObservationReader} from '../../src/propose/foottrace-lineage.mjs';
import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
const PRIVATE='PRIVATE-NATIVE-REGISTRY-BODY';
const fixture=change=>nativeHttpFixture({change});
test('unchanged native publication/source admission composes through bounded API and anonymous registry HTTP with no predecessor seed',async()=>{
 const f=fixture(),r=await createFoottraceLineageObservationReader({transport:f.port,context:f.context,settings:f.port.settings})();
 assert.equal(r.valid,true,JSON.stringify({reason:r.nativeReason,calls:f.calls.map(c=>({host:c.host,path:c.path}))}));assert.equal(r.predecessor.head,f.f.originalHead);assert.equal(r.predecessor.merge,f.f.originalMerge);
 assert.equal(r.authorized,false);assert.equal(r.privateAppIdentityAdmitted,false);assert.equal(r.provenanceCryptographicallyVerified,false);
 assert.ok(f.calls.some(c=>c.host==='registry.npmjs.org'));assert.ok(f.calls.some(c=>c.host==='api.github.com'));
 assert.ok(f.calls.every(c=>c.redirect==='error'));assert.equal(f.port.transportFacts().fetchAttempts,f.calls.length);
 assert.equal(JSON.stringify(r).includes('offline_registry_token'),false);assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);
});
test('registry substitution after real native HTTP admission retains a lineage hold',async()=>{
 const f=fixture((r,u)=>u.endsWith('/latest')?new Response(JSON.stringify({name:'wrong',version:'1.10.0',private:PRIVATE}),{headers:{'content-type':'application/json'}}):null);
 const r=await createFoottraceLineageObservationReader({transport:f.port,context:f.context,settings:f.port.settings})();
 assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('registry redirect remains held before any anonymous second host can be acquired',async()=>{
 const f=fixture((r,u)=>u.startsWith('https://registry.npmjs.org/')?new Response(null,{status:302,headers:{location:'https://other.invalid/'+PRIVATE}}):null);
 const r=await createFoottraceLineageObservationReader({transport:f.port,context:f.context,settings:f.port.settings})();
 assert.equal(r.valid,false);assert.ok(f.calls.every(c=>c.host==='api.github.com'||c.host==='registry.npmjs.org'));
});
