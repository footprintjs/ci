import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoottraceReviewReader } from '../../src/propose/foottrace-reviews.mjs';
import { pendingProviderFixture } from './pending-provider-fixture.mjs';
const PRIVATE='PRIVATE-REVIEW-PROVIDER-CONTENT';
function fixture({states=[],change=()=>{},pendingChange}={}) {
  const pending=pendingProviderFixture(pendingChange),calls=[];let reviewReads=0,permissionReads=0;
  const row=(state,i)=>({id:i+100,state,commit_id:pending.prepared.pendingSha,user:{id:42,type:'User',login:'reviewer42'},body:PRIVATE});
  const api=async(method,route,body)=>{
    calls.push({method,route,body});let data;
    if(route.includes('/pulls/41/reviews?')) {reviewReads++;const page=Number(new URL('https://fixture.invalid'+route).searchParams.get('page'));data=states.map(row).slice((page-1)*100,page*100);}
    else if(route.includes('/collaborators/')) {permissionReads++;data={permission:'write',user:{id:42,type:'User',login:'reviewer42'},private:PRIVATE};}
    else return pending.api(method,route,body);
    change(data,route,{reviewReads,permissionReads});return {data};
  };
  return {...pending,api,calls};
}
const read=async f=>createFoottraceReviewReader(f)(f.prepared);
test('empty complete adjacent review sets are known, never full eligibility or authority',async()=>{
 const f=fixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'pending-reviews-only');assert.equal(r.reviewCount,0);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.authorized,false);assert.ok(f.calls.filter(x=>x.route.includes('/reviews?')).length===2);
});
test('comments and current User permissions are metadata, not approval',async()=>{
 const f=fixture({states:['COMMENTED']}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.reviewCount,1);assert.equal(r.reviewerCount,1);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.ok(f.calls.filter(x=>x.route.includes('/collaborators/')).length===2);
});
test('an effective approval for this pending head holds',async()=>{
 const r=await read(fixture({states:['APPROVED']}));assert.equal(r.valid,false);assert.equal(r.reason,'effective-approval');
});
test('an unresolved refusal holds even when it names an older commit',async()=>{
 const r=await read(fixture({states:['CHANGES_REQUESTED'],change:(d,route)=>{if(route.includes('/reviews?'))d[0].commit_id='f'.repeat(40);}}));assert.equal(r.valid,false);assert.equal(r.reason,'effective-refusal');
});
test('a later comment never clears an earlier refusal',async()=>{
 const r=await read(fixture({states:['CHANGES_REQUESTED','COMMENTED']}));assert.equal(r.valid,false);assert.equal(r.reason,'effective-refusal');
});
test('a later explicit dismissal clears the effective refusal without erasing history',async()=>{
 const r=await read(fixture({states:['CHANGES_REQUESTED','DISMISSED']}));assert.equal(r.valid,true);assert.equal(r.reviewCount,2);assert.equal(r.retainedEligibilityAdmitted,false);
});
test('an old-head approval remains recorded but does not approve this head',async()=>{
 const r=await read(fixture({states:['APPROVED'],change:(d,route)=>{if(route.includes('/reviews?'))d[0].commit_id='f'.repeat(40);}}));assert.equal(r.valid,true);assert.equal(r.priorHeadApprovalReviews,1);assert.equal(r.authorized,false);assert.equal(r.retainedEligibilityAdmitted,false);
});
test('a pending draft review is unknown rather than clear',async()=>{
 const r=await read(fixture({states:['PENDING']}));assert.equal(r.valid,false);assert.equal(r.reason,'pending-review');
});
test('a later approval replaces refusal but still prevents refresh',async()=>{
 const r=await read(fixture({states:['CHANGES_REQUESTED','APPROVED']}));assert.equal(r.valid,false);assert.equal(r.reason,'effective-approval');
});
test('a changed final review set holds even if the first set was comments only',async()=>{
 const r=await read(fixture({states:['COMMENTED'],change:(d,route,n)=>{if(route.includes('/reviews?')&&n.reviewReads===2)d[0].state='APPROVED';}}));assert.equal(r.valid,false);
});
test('changed adjacent reviewer permission holds',async()=>{
 const r=await read(fixture({states:['COMMENTED'],change:(d,route,n)=>{if(route.includes('/collaborators/')&&n.permissionReads===2)d.permission='read';}}));assert.equal(r.valid,false);
});
test('a permission response for a different User never binds to the requested reviewer',async()=>{
 const r=await read(fixture({states:['COMMENTED'],change:(d,route)=>{if(route.includes('/collaborators/'))d.user.id=999;}}));assert.equal(r.valid,false);
});
test('unavailable permissions retain a finite failed boundary without private errors',async()=>{
 const f=fixture({states:['COMMENTED']});const original=f.api;f.api=(method,route,body)=>{if(route.includes('/collaborators/'))throw new Error(PRIVATE);return original(method,route,body);};const r=await read(f);assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.ok(r.observations.some(x=>x.kind==='reviewer-permission'&&x.status==='unavailable'));
});
test('duplicate review identities hold through the unchanged native page guard',async()=>{
 const r=await read(fixture({states:['COMMENTED','COMMENTED'],change:(d,route)=>{if(route.includes('/reviews?'))d[1].id=d[0].id;}}));assert.equal(r.valid,false);
});
test('malformed review states never retain nested private content',async()=>{
 const r=await read(fixture({states:['COMMENTED'],change:(d,route)=>{if(route.includes('/reviews?'))d[0].state={private:PRIVATE};}}));assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('public Bot comments do not request a User permission or gain authority',async()=>{
 const f=fixture({states:['COMMENTED'],change:(d,route)=>{if(route.includes('/reviews?'))d[0].user={id:500,type:'Bot'};}}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.reviewerCount,0);assert.equal(r.authorized,false);assert.equal(f.calls.some(x=>x.route.includes('/collaborators/')),false);
});
test('a Bot approval also holds under the refresh rule; it never becomes native User authority',async()=>{
 const r=await read(fixture({states:['APPROVED'],change:(d,route)=>{if(route.includes('/reviews?'))d[0].user={id:500,type:'Bot'};}}));assert.equal(r.valid,false);assert.equal(r.reason,'effective-approval');assert.equal(r.authorized,false);
});
test('moving current main at the final native pending snapshot holds',async()=>{
 const r=await read(fixture({pendingChange:(d,route,n)=>{if(route.endsWith('/git/ref/heads/main')&&n.mainReads>2)d.object.sha='f'.repeat(40);}}));assert.equal(r.valid,false);
});

test('the complete 256-review boundary is admitted without claiming complete workflow history',async()=>{
 const f=fixture({states:Array(256).fill('COMMENTED')}),r=await read(f);assert.equal(r.valid,true);assert.equal(r.reviewCount,256);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(f.calls.filter(x=>x.route.includes('/reviews?')).length,6);assert.ok(f.calls.every(x=>x.method==='GET'&&x.body===undefined));
});
test('257 retained reviews exceed the fixed review budget and hold',async()=>{
 const r=await read(fixture({states:Array(257).fill('COMMENTED')}));assert.equal(r.valid,false);
});
function manyReviewers(count) {
 return fixture({states:Array(count).fill('COMMENTED'),change:(data,route)=>{
  if(route.includes('/reviews?'))for(const row of data){const actorId=row.id+1000;row.user={id:actorId,type:'User',login:'reviewer'+actorId};}
  if(route.includes('/collaborators/')){const actorId=Number(route.match(/reviewer(\d+)\/permission$/)[1]);data.user={id:actorId,type:'User',login:'reviewer'+actorId};}
 }});
}
test('64 User reviewers bind both current permission snapshots inside the fixed total request budget',async()=>{
 const f=manyReviewers(64),r=await read(f);assert.equal(r.valid,true);assert.equal(r.reviewerCount,64);assert.equal(f.calls.filter(x=>x.route.includes('/collaborators/')).length,128);assert.ok(r.observations.length<=224);
});
test('65 User reviewers hold before unbounded permission acquisition',async()=>{
 const f=manyReviewers(65),r=await read(f);assert.equal(r.valid,false);assert.equal(f.calls.some(x=>x.route.includes('/collaborators/')),false);
});
test('descriptor getters are refused without being invoked or retaining their content',async()=>{
 let invoked=false;const f=fixture({states:['COMMENTED'],change:(data,route)=>{if(route.includes('/reviews?'))Object.defineProperty(data[0],'state',{get(){invoked=true;return PRIVATE;}});}});const r=await read(f);assert.equal(r.valid,false);assert.equal(invoked,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('effective reviews follow native IDs even if the returned array is not ID ordered',async()=>{
 const r=await read(fixture({states:['DISMISSED','CHANGES_REQUESTED'],change:(data,route)=>{if(route.includes('/reviews?')){data[0].id=101;data[1].id=100;}}}));assert.equal(r.valid,true);assert.equal(r.reviewCount,2);
});
test('refresh review ordering agrees with the existing native authority review-state law on synthetic worlds',async()=>{
 const {authorityWorld}=await import('../upstream/test/release/helpers.mjs');const {default:control}=await import('../../src/guards/release-control.cjs');
 for(const states of [[],['COMMENTED'],['APPROVED'],['CHANGES_REQUESTED'],['CHANGES_REQUESTED','COMMENTED'],['CHANGES_REQUESTED','DISMISSED'],['CHANGES_REQUESTED','APPROVED']]){
  const f=fixture({states}),w=authorityWorld(),head=f.prepared.pendingSha;w.expected.headSha=head;w.headCommit.sha=head;w.pulls[0].head.sha=head;
  w.reviews=states.map((state,i)=>({id:100+i,state,commit_id:head,user:{id:42,type:'User',login:'reviewer42'}}));w.reviewerPermissions=[{permission:'write',user:{id:42,login:'reviewer42'}}];
  const native=control.decideAuthority(w),result=await read(f);
  if(native.reason==='changes-requested')assert.equal(result.reason,'effective-refusal');
  else if(native.authorized)assert.equal(result.reason,'effective-approval');
  else {assert.equal(native.reason,'approval');assert.equal(result.valid,true);}
  assert.equal(result.authorized,false);
 }
});
test('unread provider bodies do not change owned review or permission fingerprints',async()=>{
 const make=privateText=>fixture({states:['COMMENTED'],change:(data,route)=>{
  if(route.includes('/reviews?'))for(const row of data)row.body={private:privateText};
  if(route.includes('/collaborators/'))data.private={nested:privateText};
 }});
 const a=await read(make('PRIVATE-A')),b=await read(make('PRIVATE-B'));assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.reviewDigest,b.reviewDigest);assert.equal(a.permissionDigest,b.permissionDigest);assert.deepEqual(a.observations.filter(x=>x.kind==='native-reviews'),b.observations.filter(x=>x.kind==='native-reviews'));
});
