import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverObjectFixture} from './rollover-object-provider-fixture.mjs';
import {createFoottraceRolloverInspection} from '../../src/propose/foottrace-rollover-inspection.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
import {computeFoottraceProposalMetadata} from '../../src/propose/computed-proposal-metadata.mjs';
async function begin(f){
 const s=createFoottraceRolloverInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);assert.notEqual(s.getBackend(),null);
 const before=s.createTransitionObserver();
 assert.equal(typeof before.forCreatedProposal,'function','native SAME ordinary created-PR INPUT role absent');
 const read=before.forCreatedProposal(991);f.f.tip=f.objectHead;
 assert.equal((await before({head:f.objectHead})).valid,false);
 return read;
}
// An independently established offline PR/ref world is INPUT only. This never
// claims our create-PR response, producer attribution, a grant or retry safety.
function created(f){
 const p=structuredClone(f.pending);
 Object.assign(p,{number:991,state:'open',merged:false,merged_at:null,auto_merge:null,merge_commit_sha:null,
  ...computeFoottraceProposalMetadata(f.prepared)});
 p.head.sha=f.objectHead;p.base.sha=f.M;f.f.tip=f.objectHead;f.f.pulls.push(p);return p;
}
test('ordinary created-PR INPUT uses SAME complete N/M/L closure and exact single configured-App PR',async()=>{
 const f=await rolloverObjectFixture(),read=await begin(f);created(f);
 const v=await read({head:f.objectHead});assert.equal(v.valid,true);assert.equal(v.scope,'ordinary-created-pr-inputs-only');
 assert.equal(v.reference.pr,991);assert.equal(v.reference.head,f.objectHead);assert.deepEqual(v.reference.parents,[f.M,f.f.originalHead]);
 assert.equal(v.authorized,false);assert.equal(v.submissionAcknowledged,false);assert.equal(v.originalProducerAttributed,false);
 assert.equal(v.writerCredentialBindingAdmitted,false);assert.equal(JSON.stringify(v).includes('Release App proposal'),false);
});
for(const kind of ['actor-login','metadata','automerge','second-open','wrong-base','missing-pr','reservation'])test('ordinary created-PR INPUT refuses '+kind,async()=>{
 const f=await rolloverObjectFixture(),read=await begin(f),p=created(f);
 if(kind==='actor-login')p.user.login='unrelated[bot]';
 if(kind==='metadata')p.body+=' stale';
 if(kind==='automerge')p.auto_merge={enabled_by:{id:1}};
 if(kind==='second-open'){const other=structuredClone(p);other.number=992;f.f.pulls.push(other);}
 if(kind==='wrong-base')p.base.sha=f.P;
 if(kind==='missing-pr')f.f.pulls.splice(f.f.pulls.indexOf(p),1);
 if(kind==='reservation')[...f.f.releases.values()][0].assets.push({id:99891,name:'publish-attempt-'+f.prepared.version+'.json',state:'uploaded',size:12});
 assert.equal((await read({head:f.objectHead})).valid,false);
 const stopped=f.calls.length;assert.equal((await read({head:f.objectHead})).valid,false);assert.equal(f.calls.length,stopped);
});

test('ordinary created-PR INPUT rechecks the actual detail independently of a healthy list',async()=>{
 const f=await rolloverObjectFixture({changeHttp:async(response,url)=>{
  if(new URL(url).pathname==='/repos/footprintjs/foottrace/pulls/991'){
   const p=await response.json();p.body+=' stale detail';return Response.json(p);
  }return response;
 }}),read=await begin(f);created(f);assert.equal((await read({head:f.objectHead})).valid,false);
});
