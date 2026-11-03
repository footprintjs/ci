import test from 'node:test';
import assert from 'node:assert/strict';
import * as readers from '../../src/propose/foottrace-reviews.mjs';
import {createFoottracePendingObservationReader} from '../../src/propose/foottrace-pending.mjs';
import {pendingProviderFixture} from './pending-provider-fixture.mjs';
const PRIVATE='PRIVATE-REVIEW-OBSERVATION';
async function fixture({states=[],change=()=>{},pendingChange}={}) {
 const f=pendingProviderFixture(pendingChange);
 const observed=await createFoottracePendingObservationReader(f)();assert.equal(observed.valid,true);
 f.calls.length=0;let reviews=0,permissions=0;
 const api=async(method,route,body)=>{
  let data;
  if(route.includes('/reviews?')){
   reviews++;const page=Number(new URL('https://fixture.invalid'+route).searchParams.get('page'));
   data=states.map((state,i)=>({id:100+i,state,commit_id:observed.reference.head,user:{id:42,type:'User',login:'reviewer42'},body:PRIVATE})).slice((page-1)*100,page*100);
  }else if(route.includes('/collaborators/')){
   permissions++;data={permission:'write',user:{id:42,type:'User',login:'reviewer42'},private:PRIVATE};
  }else return f.api(method,route,body);
  f.calls.push({method,route,body});change(data,route,{reviews,permissions});return {data};
 };
 return {...f,api,reference:observed.reference};
}
async function read(f,reference=f.reference){
 assert.equal(typeof readers.createFoottraceReviewObservationReader,'function');
 return readers.createFoottraceReviewObservationReader(f)(reference);
}
test('actual current-reference reviews need no preparationRefs or original producer claim',async()=>{
 const f=await fixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'pending-reviews-only');
 assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.reviewCount,0);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 assert.equal(f.calls.filter(x=>x.route.includes('/reviews?')).length,2);
 assert.ok(f.calls.every(x=>x.method==='GET'&&x.body===undefined));
});
for(const [name,states,reason] of [
 ['current approval',['APPROVED'],'effective-approval'],
 ['refusal followed by comment',['CHANGES_REQUESTED','COMMENTED'],'effective-refusal'],
 ['pending review',['PENDING'],'pending-review']
])test(name+' holds the actual current reference',async()=>{
 const r=await read(await fixture({states}));assert.equal(r.valid,false);assert.equal(r.reason,reason);
});
test('old-head approval and explicit dismissal retain history without authorizing an effect',async()=>{
 for(const states of [['APPROVED'],['CHANGES_REQUESTED','DISMISSED']]){
  const f=await fixture({states,change:(d,p)=>{if(p.includes('/reviews?')&&states.length===1)d[0].commit_id='f'.repeat(40);}});
  const r=await read(f);assert.equal(r.valid,true);assert.equal(r.reviewCount,states.length);assert.equal(r.authorized,false);
  assert.equal(r.priorHeadApprovalReviews,states.length===1?1:0);
 }
});
test('closed exact reference is validated and detached before any acquisition',async()=>{
 const f=await fixture();
 for(const reference of [{...f.reference,source:'f'.repeat(40)},{...f.reference,pr:'41'},{...f.reference,tree:'bad'},{...f.reference,parents:[]},{...f.reference,parents:[f.reference.head,f.reference.head]},{...f.reference,grant:true}]){
  const r=await read(f,reference);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
 }
 let invoked=false;const value={...f.reference};Object.defineProperty(value,'tree',{get(){invoked=true;return PRIVATE;}});
 const r=await read(f,value);assert.equal(r.valid,false);assert.equal(invoked,false);assert.equal(f.calls.length,0);
});
test('a well-shaped reference for another head or parent cannot borrow current observations',async()=>{
 const f=await fixture();
 for(const reference of [{...f.reference,head:'f'.repeat(40)},{...f.reference,parents:[...f.reference.parents].reverse()},{...f.reference,botId:f.reference.botId+1},{...f.reference,observedBase:'f'.repeat(40)}]){
  const r=await read(f,reference);assert.equal(r.valid,false);
 }
 assert.equal(f.calls.some(x=>x.route.includes('/reviews?')),false);
});
test('a caller cannot change the bound expected reference during acquisition',async()=>{
 const f=await fixture(),expected=structuredClone(f.reference),api=f.api;let once=false;
 f.api=async(...args)=>{if(!once){once=true;expected.head='f'.repeat(40);}return api(...args);};
 const r=await read(f,expected);assert.equal(r.valid,true);assert.notEqual(r.reference.head,expected.head);
});
test('native review drift and current permission drift hold the independent observer',async()=>{
 for(const change of [
  (d,p,n)=>{if(p.includes('/reviews?')&&n.reviews===2)d[0].state='APPROVED';},
  (d,p,n)=>{if(p.includes('/collaborators/')&&n.permissions===2)d.permission='read';},
  (d,p)=>{if(p.includes('/collaborators/'))d.user.id++;}
 ]){
  const r=await read(await fixture({states:['COMMENTED'],change}));assert.equal(r.valid,false);
  assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 }
});
test('the independent current-reference adapter retains complete-page and review-size bounds',async()=>{
 for(const count of [256,257]){
  const r=await read(await fixture({states:Array(count).fill('COMMENTED')}));assert.equal(r.valid,count===256);
 }
 const f=await fixture({states:['COMMENTED','COMMENTED'],change:(d,p)=>{if(p.includes('/reviews?'))d[1].id=d[0].id;}});
 assert.equal((await read(f)).valid,false);
});
test('current-reference drift after the review read is not a review clearance',async()=>{
 const f=await fixture(),api=f.api;let details=0;
 f.api=async(method,route,body)=>{
  const r=await api(method,route,body);
  if(route.endsWith('/pulls/41')&&++details>2)r.data.updated_at='2026-11-02T02:00:00Z';
  return r;
 };
 assert.equal((await read(f)).valid,false);
});
