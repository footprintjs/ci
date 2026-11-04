import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverObjectFixture} from './rollover-object-provider-fixture.mjs';
import {createFoottraceRolloverInspection} from '../../src/propose/foottrace-rollover-inspection.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
async function fixture(){
 const f=await rolloverObjectFixture(),s=createFoottraceRolloverInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);assert.notEqual(s.getBackend(),null);
 const read=s.createTransitionObserver();f.f.tip=f.objectHead;
 const row=structuredClone(f.pending);row.number=303;row.state='closed';row.head.sha=f.P;row.merged_at=null;row.merge_commit_sha=null;
 return {f,read,row};
}
test('complete ordinary PR window refuses a malformed non-null closed merge identity even on an unrelated row',async()=>{
 const {f,read,row}=await fixture();row.merge_commit_sha={untrusted:'not a native Git identity'};f.f.pulls.push(row);
 assert.equal((await read({head:f.objectHead})).valid,false);
});
test('complete ordinary PR window preserves a valid unrelated unmerged closed row as INPUT only',async()=>{
 const {f,read,row}=await fixture();f.f.pulls.push(row);
 const v=await read({head:f.objectHead});assert.equal(v.valid,true);assert.equal(v.authorized,false);assert.equal(v.submissionAcknowledged,false);
});

test('complete ordinary PR window keeps a missing merge identity unknown instead of inferring null',async()=>{
 const {f,read,row}=await fixture();delete row.merge_commit_sha;f.f.pulls.push(row);
 assert.equal((await read({head:f.objectHead})).valid,false);
});
