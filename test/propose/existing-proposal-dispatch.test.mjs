import test from 'node:test';
import {FlowChartExecutor} from 'footprintjs';
import assert from 'node:assert/strict';
import {metadataC1Fixture,PRIVATE} from './metadata-c1-provider-fixture.mjs';
import {refreshFixture} from './pending-refresh-provider-fixture.mjs';
const implementation=await import('../../src/propose/foottrace-proposal.mjs').catch(()=>({}));
const run=options=>{assert.equal(typeof implementation.runFoottraceProposal,'function','native existing-proposal dispatcher absent');return implementation.runFoottraceProposal(options);};
function native(result,branch){
 assert.equal(result.record.complete,true);assert.equal(result.report.route,branch);
 assert.equal(result.report.authorized,false);assert.equal(result.report.releaseReady,false);
 const s=result.record.snapshot,ids=s.commitLog.map(x=>x.stageId);
 assert.equal(ids.filter(x=>x==='proposal-bootstrap-capture').length,1);
 assert.equal(ids.filter(x=>x==='proposal-route-terminal').length,1);
 assert.equal(Object.keys(s.subflowResults??{}).length,0,'all native pre-effects remain in the actual owning root log');
 assert.equal(JSON.stringify(result).includes(PRIVATE),false);
 const spec=JSON.stringify(result.record.structure);
 assert.ok(spec.includes('metadata-c1-pre-effect')&&spec.includes('pending-successor-pre-effect'),'native public structure includes BOTH constructed branches, not just runtime effects');return ids;
}
test('actual same-target signed proposal selects SAME C1 on ONE native owner/log',async()=>{
 const f=await metadataC1Fixture(),r=await run(f.makeInvocation()),ids=native(r,'metadata-only');
 assert.equal(r.status,'metadata-match');assert.equal(f.patches.length,1);
 assert.ok(ids.includes('metadata-c1-pre-effect'));assert.ok(!ids.includes('pending-successor-pre-effect'));
});
test('actual changed target selects SAME pending ref-refresh on ONE native owner/log',async()=>{
 const f=await refreshFixture(),r=await run(f.makeInvocation()),ids=native(r,'ref-refresh');
 assert.equal(r.status,'metadata-reconciled');assert.equal(f.effects.length,5);assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);
 assert.ok(ids.includes('pending-successor-pre-effect'));assert.ok(ids.includes('pending-refresh-ref-pre-effect'));
 assert.ok(!ids.includes('metadata-c1-pre-effect'));
});
test('same target with exact metadata remains a checked native C1 no-op',async()=>{
 const f=await metadataC1Fixture({exact:true}),r=await run(f.makeInvocation());native(r,'metadata-only');
 assert.equal(r.status,'metadata-match');assert.equal(f.patches.length,0);
 assert.ok(f.calls.some(x=>x.path.includes('/actions/workflows/ci.yml')),'standalone C1 checks are not waived by post-ref ruling');
});
test('caller DATA cannot select the other route or supply source/commit authority',async()=>{
 let supplied=0;const fake=()=>{supplied++;throw Error('untrusted route callback');};
 const f=await refreshFixture(),r=await run({...f.makeInvocation(),route:'metadata-only',prepared:{targetTree:'f'.repeat(40)},
  root:{getBackend:fake},chart:{build:fake},executor:{getSnapshot:fake},completed:fake,continuation:fake});
 native(r,'ref-refresh');assert.equal(r.status,'metadata-reconciled');assert.equal(supplied,0);assert.equal(f.refMoves.length,1);
});
test('uncertain ref stops this selected route with GET-only and never a C1 fallback',async()=>{
 const f=await refreshFixture({refStatus:503}),r=await run(f.makeInvocation()),ids=native(r,'ref-refresh');
 assert.equal(r.status,'refresh-verify-only');assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,0);
 assert.equal(r.report.refMoved,null);assert.ok(!ids.includes('metadata-c1-root-boundary'));
});
test('failed same-target required check is technical and never selects the other branch',async()=>{
 const f=await metadataC1Fixture({checkFailure:true}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
 assert.equal(r.report.route,'metadata-only');
 assert.ok(!r.record.snapshot.commitLog.some(x=>x.stageId==='pending-successor-root-boundary'));
});
test('ambiguous actual App PRs refuse before either effect recipe',async()=>{
 const f=await refreshFixture({change:(data,path)=>{
  if(path.includes('/pulls?state=all')){const p=data.find(x=>x.state==='open');data.push({...structuredClone(p),id:1202,number:102});}
 }}),r=await run(f.makeInvocation());
 assert.equal(r.status,'technical-failure');assert.equal(f.effects.length,0);assert.equal(f.refMoves.length,0);assert.equal(f.patches.length,0);
 assert.ok(!r.record.snapshot.commitLog.some(x=>x.stageId==='metadata-c1-root-boundary'||x.stageId==='pending-successor-root-boundary'));
});
for(const apply of [true,false])test('same-target uncertain setter preserves '+(apply?'exact GET completion':'stale HOLD for this invocation'),async()=>{
 const f=await metadataC1Fixture({status:503,apply}),r=await run(f.makeInvocation());native(r,'metadata-only');
 assert.equal(r.status,apply?'metadata-match':'metadata-hold');assert.equal(f.patches.length,1);assert.equal(r.report.submission,'uncertain');
});
test('actual owning commit-count mismatch refuses before branch acquisition or effects',async()=>{
 const original=FlowChartExecutor.prototype.getCommitCount;
 try{
  FlowChartExecutor.prototype.getCommitCount=function(){return original.call(this)+1;};
  const f=await metadataC1Fixture(),r=await run(f.makeInvocation());
  assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);
  assert.ok(!f.calls.some(x=>x.path.includes('/pulls')),'root completion must be checked before reading any route PR');
 }finally{FlowChartExecutor.prototype.getCommitCount=original;}
});
test('truncated dispatcher diagnostics cannot turn returned effects into successful completion',async()=>{
 const f=await refreshFixture(),r=await run({...f.makeInvocation(),recordLimitBytes:256});
 assert.equal(r.status,'technical-failure');assert.equal(r.record.complete,false);
 assert.equal(f.refMoves.length,1);assert.equal(f.patches.length,1);assert.equal(r.report.authorized,false);
});
