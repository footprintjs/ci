import test from 'node:test';
import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {createFoottraceMetadataWriterBootstrap} from '../../src/propose/proposal-bootstrap-flow.mjs';
import {createFoottraceProposeInspection} from '../../src/propose/foottrace-inspection.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
/** Synthetic returned-ref DATA fixture for an INPUT observer, no production
 * pre-effect/HTTP-writer/hosted or effect-authority proof is claimed here. */
async function fixture(options={}){
 const f=await refreshFixture(options),root=createFoottraceMetadataWriterBootstrap(f.makeInvocation());
 const input=createFoottraceProposeInspection(root.getInvocationInput(),root.chart);let head=null;
 const chart=input.chart.addFunction('Model coherent acknowledged ref DATA for the input observer',scope=>{
  const b=input.getBackend();assert.equal(b.retainedAttempts.eligible,true);const prepared=b.prepared;
  const inventory=new Map(f.f.trees.get(prepared.sourceTree));
  for(const [path,content] of Object.entries(prepared.prepared.updates)){
   const bytes=Buffer.from(content);inventory.set(path,{mode:'100644',sha:preparation.gitObject('blob',bytes),bytes});
  }
  for(const path of prepared.prepared.deletions)inventory.delete(path);
  head=f.f.addCommit(inventory,[f.M,f.P]);
  assert.equal(f.f.commits.get(head).tree.sha,prepared.targetTree);
  f.f.tip=head;f.pending.head.sha=head;
  scope.modeledTransitionInput={headSha:head,authorized:false};
 },'test-modeled-transition-input');
 const run=await runNativeObservationRecord({chart});assert.equal(run.record.complete,true);
 const observe=input.createTransitionObserver();assert.equal(input.getBackend(),null);assert.equal(await input.reobserve(),false);
 return {f,observe,head};
}
test('post-ref observation reacquires exact N/source/history without CI or any continuation grant',async()=>{
 const {observe,head}=await fixture(),r=await observe({head});
 assert.equal(r.valid,true);assert.equal(r.reference.head,head);assert.equal(r.authorized,false);
 assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.retainedEligibilityAdmitted,false);
 assert.equal(r.originalProducerAttributed,false);assert.equal(r.ciForMetadataRequired,false);assert.equal(r.mergeReleaseGatesStillRequired,true);
});
test('concurrent post-ref input observation permanently invalidates BOTH siblings with no resurrection',async()=>{
 let block=false,enter,release;const entered=new Promise(r=>{enter=r;}),pending=new Promise(r=>{release=r;});
 const {observe,head}=await fixture({changeHttp:reply=>{if(block){block=false;enter();return pending.then(()=>reply);}}});
 block=true;const first=observe({head});let failure,second;
 try{await Promise.race([entered,first.then(()=>assert.fail('first observation settled before owned barrier'))]);second=await observe({head});}
 catch(error){failure=error;}finally{release();}
 const settled=await first;if(failure)throw failure;
 assert.equal(second.valid,false);assert.equal(settled.valid,false,'first cannot resurrect a sibling-invalidated native input');
 assert.equal((await observe({head})).valid,false);
});
