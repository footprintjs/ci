import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {captureFoottraceMetadataWriterInvocation} from '../../src/propose/proposal-invocation.mjs';
const implementation=await import('../../src/propose/nonforce-ref-submission.mjs').catch(()=>({}));
async function fixture(options={}){
 assert.equal(typeof implementation.createFoottraceRefSubmission,'function','single shared native ref submission adapter absent');
 const f=await refreshFixture(options),captured=captureFoottraceMetadataWriterInvocation(f.makeInvocation());
 return {f,submission:implementation.createFoottraceRefSubmission({transport:captured.transport,head:f.P})};
}
// IO-only synthetic provider tests: ACK is a returned response fact, never
// domain/source/current writer permission; real owning native guards remain owed.
test('shared ref adapter acknowledges only exact returned force:false and permits ONE submission',async()=>{
 const {f,submission}=await fixture();await submission.submit();const s=submission.observation();
 assert.equal(s.outcome,'acknowledged');assert.equal(s.moved,true);assert.equal(s.attempted,true);assert.equal(s.authorized,false);
 await assert.rejects(()=>submission.submit());assert.equal(submission.observation().outcome,'acknowledged');assert.equal(submission.observation().moved,true);assert.equal(f.refMoves.length,1);assert.deepEqual(f.refMoves[0],{sha:f.P,force:false});
});
test('shared uncertain returned transport never claims movement attribution or an ACK',async()=>{
 const {f,submission}=await fixture({refStatus:503});await submission.submit();
 assert.equal(submission.observation().outcome,'uncertain');assert.equal(submission.observation().moved,null);
 await assert.rejects(()=>submission.submit());assert.equal(f.refMoves.length,1);
});
test('shared ref adapter keeps known inconsistent reply RETURNED and never erases it as acknowledged',async()=>{
 const {f,submission}=await fixture({refReplyChange:d=>{d.object.type='tag';}});
 await assert.rejects(()=>submission.submit());assert.equal(submission.observation().outcome,'returned');assert.equal(submission.observation().moved,null);
 await assert.rejects(()=>submission.submit());assert.equal(f.refMoves.length,1);
});
test('shared known ref refusal stays technical and cannot reopen the writer',async()=>{
 const {f,submission}=await fixture({refStatus:401});await assert.rejects(()=>submission.submit());
 assert.equal(submission.observation().outcome,'rejected');assert.equal(submission.observation().moved,null);
 await assert.rejects(()=>submission.submit());assert.equal(f.refMoves.length,1);
});
