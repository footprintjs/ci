import test from 'node:test';
import assert from 'node:assert/strict';
import {runPendingWitnessDiscovery} from '../../src/propose/discovery-flow.mjs';
import {createFoottraceDiscoveryPorts} from '../../src/propose/foottrace-discovery-ports.mjs';
import {discoveryFixture,PRIVATE} from './discovery-provider-fixture.mjs';
async function run(options={},extra={}) {const f=await discoveryFixture(options);return runPendingWitnessDiscovery({...f,...createFoottraceDiscoveryPorts(f),inputs:{pending:f.pending,lineage:f.lineage,collection:f.collection},...extra});}
test('actual native discovery saves a navigable decision and compact bound references without raw source/archive/provider data',async()=>{
 const r=await run();assert.equal(r.status,'pending-witnesses-only');assert.equal(r.record.complete,true);assert.ok(r.backend?.pending);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);assert.equal(r.report.count,1);
 assert.match(r.report.receiptRef,/^[a-f0-9]{64}$/);const text=JSON.stringify(r.record);assert.equal(text.includes(PRIVATE),false);
 assert.equal(text.includes('First fixture change'),false);assert.equal(text.includes('manifest.json'),false);
 assert.match(text,/propose-discovery-decision/);assert.match(text,/pending-witness-discovery/);
});
test('native ambiguity holds with a saved finite reason and no prepared backend',async()=>{
 const r=await run({duplicates:1});assert.equal(r.status,'held');assert.equal(r.backend,null);assert.equal(r.report.reason,'preparation-candidate-ambiguous');
 assert.equal(r.record.complete,true);assert.match(JSON.stringify(r.record),/preparation-candidate-ambiguous/);
});
test('an incomplete bounded native record discards even a valid discovered backend',async()=>{
 const r=await run({}, {recordLimitBytes:256});assert.equal(r.status,'incomplete');assert.equal(r.backend,null);assert.equal(r.record.complete,false);
});
test('missing trusted discovery dependency records a hold and never leaks thrown private bodies',async()=>{
 const r=await run({}, {readSource:async()=>{throw new Error(PRIVATE);}});assert.equal(r.status,'held');assert.equal(r.backend,null);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
