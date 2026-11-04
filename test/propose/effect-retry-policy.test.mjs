import test from 'node:test';
import assert from 'node:assert/strict';
const policy=await import('../../src/propose/effect-retry-policy.mjs').catch(()=>({}));
const read=name=>{assert.equal(typeof policy.effectRetryPolicy,'function');return policy.effectRetryPolicy(name);};
test('C1 exact PR metadata permits one later fresh invocation but no in-invocation uncertain retry',()=>{
 const r=read('set-pr-metadata');assert.equal(r.retrySafety,'idempotent-exact-value');
 assert.equal(r.afterUncertain,'get-verify-only');assert.equal(r.retryWithinInvocation,false);
 assert.equal(r.freshLaterInvocation,'fresh-eligibility-once');assert.equal(r.authorized,false);
});
test('every non-idempotent native proposal/publication effect retains GET-only uncertainty across invocations',()=>{
 for(const effect of ['create-blob','create-tree','create-commit','move-ref','create-pr','publish']){
  const r=read(effect);assert.equal(r.retrySafety,'non-repeatable-after-uncertainty');
  assert.equal(r.freshLaterInvocation,'get-verify-only');assert.equal(r.retryWithinInvocation,false);assert.equal(r.authorized,false);
 }
});
test('unknown effect names and shaped grants have no metadata-PATCH fallback',()=>{
 for(const effect of [undefined,null,'PATCH','constructor','__proto__',{effect:'set-pr-metadata',authorized:true}]){
  assert.throws(()=>read(effect));
 }
});
test('effect policy is immutable data and cannot carry saved permission or a callback',()=>{
 const r=read('set-pr-metadata');assert.equal(Object.isFrozen(r),true);
 assert.throws(()=>{r.retryWithinInvocation=true;});assert.equal(Object.values(r).some(x=>typeof x==='function'),false);
});
