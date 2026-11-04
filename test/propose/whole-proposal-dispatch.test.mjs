import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
import {rolloverProposalFixture} from './rollover-proposal-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-proposal.mjs').catch(()=>({}));
function entry(){assert.equal(typeof implementation.runFoottraceProposal,'function','whole SAME-owner native proposal entry absent');return implementation.runFoottraceProposal;}
function native(r,route){
 assert.equal(r.record.complete,true);assert.equal(r.report.route,route);assert.equal(r.report.authorized,false);assert.equal(r.report.releaseReady,false);
 const s=r.record.snapshot,ids=s.commitLog.map(x=>x.stageId);assert.equal(ids.filter(x=>x==='proposal-bootstrap-capture').length,1);
 assert.equal(ids.filter(x=>x==='proposal-route-terminal').length,1);assert.equal(Object.keys(s.subflowResults??{}).length,0);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);
 const structure=JSON.stringify(r.record.structure);
 for(const id of ['metadata-c1-pre-effect','pending-successor-pre-effect','rollover-pr-pre-effect'])assert.ok(structure.includes(id));
 return ids;
}
for(const route of ['metadata-only','ref-refresh','ordinary'])test('whole native entry selects actual '+route+' on ONE owner/root log',async()=>{
 const run=entry(),f=await(route==='metadata-only'?metadataC1Fixture():route==='ref-refresh'?refreshFixture():rolloverProposalFixture()),r=await run(f.makeInvocation()),ids=native(r,route);
 assert.equal(r.status,route==='metadata-only'?'metadata-match':route==='ref-refresh'?'metadata-reconciled':'rollover-proposed');
 if(route==='metadata-only'){assert.equal(f.patches.length,1);assert.ok(!ids.includes('pending-successor-pre-effect'));assert.ok(!ids.includes('rollover-objects-pre-effect'));}
 if(route==='ref-refresh'){assert.equal(f.effects.length,5);assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);assert.ok(!ids.includes('metadata-c1-pre-effect'));assert.ok(!ids.includes('rollover-objects-pre-effect'));}
 if(route==='ordinary'){assert.equal(f.refMoves.length,1);assert.equal(f.prCreates.length,1);assert.ok(!ids.includes('metadata-c1-pre-effect'));assert.ok(!ids.includes('pending-successor-pre-effect'));}
});
test('whole entry ignores DATA route/graph/current-writer/completion selectors',async()=>{
 const run=entry();let supplied=0;const fake=()=>{supplied++;throw Error('untrusted DATA');};
 const f=await rolloverProposalFixture(),r=await run({...f.makeInvocation(),route:'metadata-only',completed:fake,execution:fake,continuation:fake,prepared:{targetTree:'f'.repeat(40)},root:{getBackend:fake}});
 native(r,'ordinary');assert.equal(supplied,0);assert.equal(f.prCreates.length,1);
});
test('failed all-PR GET is unknown, never zero-open ordinary authority',async()=>{
 const run=entry(),f=await rolloverProposalFixture(),inv=f.makeInvocation(),original=inv.fetcher;let refused=0;
 inv.fetcher=(url,request)=>{const u=new URL(url);if(request.method==='GET'&&u.pathname.endsWith('/pulls')&&u.searchParams.get('state')==='all'){refused++;return Promise.resolve(new Response('{}',{status:503}));}return original(url,request);};
 const r=await run(inv);assert.equal(refused,1);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.prCreates.length,0);
});
test('ambiguous native PRs refuse before every effect recipe',async()=>{
 const run=entry(),f=await refreshFixture({change:(data,path)=>{if(path.includes('/pulls?state=all')){const p=data.find(x=>x.state==='open');data.push({...structuredClone(p),id:p.id+1,number:p.number+1});}}}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.patches.length,0);
});
test('ordinary uncertain ref cannot fall back to existing metadata or pending refresh',async()=>{
 const run=entry(),f=await rolloverProposalFixture({refStatus:503}),r=await run(f.makeInvocation()),ids=native(r,'ordinary');
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(r.report.refOutcome,'uncertain');assert.equal(f.prCreates.length,0);
 assert.ok(!ids.includes('metadata-c1-pre-effect'));assert.ok(!ids.includes('pending-successor-pre-effect'));
});
test('ordinary uncertain unapplied PR remains GET-only across whole-entry invocations',async()=>{
 const run=entry(),f=await rolloverProposalFixture({prStatus:503,prApply:false}),r=await run(f.makeInvocation());native(r,'ordinary');
 assert.equal(r.status,'rollover-proposal-verify-only');assert.equal(r.report.prSubmission,'uncertain');assert.equal(f.prCreates.length,1);
 const refs=f.refMoves.length,later=await run(f.makeInvocation());assert.notEqual(later.status,'rollover-proposed');assert.equal(f.refMoves.length,refs);assert.equal(f.prCreates.length,1);
});
test('failed same-target required checks never admit ordinary fallback',async()=>{
 const run=entry(),f=await metadataC1Fixture({checkFailure:true}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(r.report.route,'metadata-only');assert.equal(f.patches.length,0);
 assert.ok(!r.record.snapshot.commitLog.some(x=>x.stageId==='rollover-objects-root-boundary'));
});
test('zero-open observation with an orphan unpublished ref grants no ordinary effects',async()=>{
 const run=entry(),f=await rolloverProposalFixture();f.f.tip=f.P;const r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.prCreates.length,0);
});

for(const kind of ['adjacent-window-drift','missing-closed-merge','oversize-window'])test('whole native selector refuses '+kind+' before ordinary effects',async()=>{
 const run=entry(),f=await rolloverProposalFixture(),inv=f.makeInvocation(),original=inv.fetcher;let lists=0,oversizeRow=null;
 inv.fetcher=async(url,request)=>{
  const response=await original(url,request),u=new URL(url);
  if(request.method==='GET'&&u.pathname.endsWith('/pulls')&&u.searchParams.get('state')==='all'){
   lists++;const rows=await response.json();
   if(kind==='adjacent-window-drift'&&lists===2)rows[0].base.sha='f'.repeat(40);
   if(kind==='missing-closed-merge'&&lists<=2)delete rows[0].merge_commit_sha;
   if(kind==='oversize-window'){oversizeRow??=structuredClone(rows[0]);const row=structuredClone(oversizeRow),page=Number(u.searchParams.get('page')??1),all=Array.from({length:257},(_,i)=>({...structuredClone(row),id:3000+i,number:1000+i}));rows.splice(0,rows.length,...all.slice((page-1)*100,page*100));}
   return Response.json(rows);
  }return response;
 };
 const r=await run(inv);assert.ok(lists>0);assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.prCreates.length,0);
});
