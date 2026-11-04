import test from 'node:test';
import assert from 'node:assert/strict';
import {rolloverFixture} from './rollover-provider-fixture.mjs';
import {bootstrapFixture} from './bootstrap-provider-fixture.mjs';
import {createFoottraceRolloverInputReader} from '../../src/propose/foottrace-rollover-inputs.mjs';
import {createFoottraceInputBootstrap} from '../../src/propose/foottrace-input-bootstrap.mjs';
import {runNativeObservationRecord} from '../../src/propose/native-observation-record.mjs';
const implementation=await import('../../src/propose/proposal-object-plan.mjs').catch(()=>({}));
function entry(name){assert.equal(typeof implementation[name],'function','SAME object plan CODE entry absent');return implementation[name];}
async function ordinary(){
 const f=await rolloverFixture(),rollover=await createFoottraceRolloverInputReader({transport:f.transport,context:f.fullContext})(f.prepared);
 assert.equal(rollover.valid,true);return {f,input:{repository:f.fullContext.repository,prepared:f.prepared,rollover}};
}
test('ordinary object plan preserves actual M/L ordered parents and exact prepared native tree without effects',async()=>{
 const {f,input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan')(input);
 assert.deepEqual(plan.at(-1).payload.parents,[f.M,f.f.originalHead]);assert.equal(plan.at(-1).payload.tree,f.prepared.targetTree);
 assert.equal(plan.at(-2).payload.base_tree,f.prepared.sourceTree);assert.equal(plan.at(-2).expected,f.prepared.targetTree);
 assert.equal(plan.some(row=>['move-ref','create-pr'].includes(row.effect)),false);
 assert.equal(f.f.calls.filter(c=>c.method!=='GET').length,0);
});
test('pending object plan uses SAME recipe with exact M/P and keeps P distinct from L',async()=>{
 const f=await bootstrapFixture(),s=createFoottraceInputBootstrap({transport:f.transport,context:f.context});
 assert.equal((await runNativeObservationRecord({chart:s.chart})).record.complete,true);
 const p=s.getBackend().prepared,plan=entry('createFoottracePendingObjectPlan')({repository:f.fullContext.repository,prepared:p});
 assert.deepEqual(plan.at(-1).payload.parents,[f.M,f.P]);assert.notEqual(f.P,f.f.originalHead);
});
for(const key of ['sourceSha','sourceTree','targetTree'])test('ordinary object plan rejects native rollover '+key+' substitution',async()=>{
 const {input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan');
 assert.throws(()=>plan({...input,rollover:{...input.rollover,reference:{...input.rollover.reference,[key]:'f'.repeat(40)}}}));
});
test('ordinary object plan cannot convert current input into pending role',async()=>{
 const {f,input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan');
 assert.throws(()=>plan({...input,prepared:{...input.prepared,pendingSha:f.P}}));
});
test('ordinary plan refuses a fabricated second-parent pair',async()=>{
 const {f,input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan');
 assert.throws(()=>plan({...input,rollover:{...input.rollover,reference:{...input.rollover.reference,nextParents:[f.M,f.P]}}}));
});
test('one shared object recipe deduplicates exact blob bytes while retaining both tree paths and deletions',async()=>{
 const {input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan')({...input,prepared:{...input.prepared,
  prepared:{...input.prepared.prepared,updates:{'one.txt':'same bytes','two.txt':'same bytes'},deletions:['old.txt']}}});
 assert.equal(plan.filter(row=>row.effect==='create-blob').length,1);
 const tree=plan.find(row=>row.effect==='create-tree').payload.tree;
 assert.equal(tree.filter(row=>row.sha===plan[0].expected).length,2);assert.equal(tree.find(row=>row.path==='old.txt').sha,null);
 // Pure plan DATA is not target-tree, eligibility or effect admission.
 assert.equal(plan.at(-2).expected,input.prepared.targetTree);
 assert.throws(()=>{plan[0].payload.content='changed';});
});
test('shared planned tree path cannot escape the Git inventory',async()=>{
 const {input}=await ordinary(),plan=entry('createFoottraceRolloverObjectPlan');
 assert.throws(()=>plan({...input,prepared:{...input.prepared,prepared:{...input.prepared.prepared,updates:{'../bad':'text'}}}}));
});
