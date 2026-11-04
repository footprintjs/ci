import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoottraceProposalWithOutput} from '../../src/propose/foottrace-proposal.mjs';
import {metadataC1Fixture} from './metadata-c1-provider-fixture.mjs';
import {rolloverProposalFixture} from './rollover-proposal-provider-fixture.mjs';
const module=await import('../../src/propose/writer-program.mjs').catch(()=>({}));
function entry(){assert.equal(typeof module.runFoottraceProposalWithOutput,'function','closed native writer program API absent');return module.runFoottraceProposalWithOutput;}
test('closed writer program exposes only the same guarded output entry',()=>{
 const run=entry();assert.deepEqual(Object.keys(module),['runFoottraceProposalWithOutput']);assert.equal(run,runFoottraceProposalWithOutput);
});
test('writer program refuses missing local output ports before native provider effects',async()=>{
 const run=entry(),f=await metadataC1Fixture(),input=f.makeInvocation(),r=await run({...input,appendSummary:async()=>{}});
 assert.equal(r.status,'technical-failure');assert.equal(f.patches.length,0);assert.equal(r.report.output.saved,false);assert.equal('GH_TOKEN' in input.env,false);
});
test('writer program returns one native matched output without release authority',async()=>{
 const run=entry(),f=await metadataC1Fixture(),events=[],r=await run({...f.makeInvocation(),appendSummary:async t=>events.push(['summary',t]),appendOutput:async t=>events.push(['output',t])});
 assert.equal(r.record.complete,true);assert.equal(r.status,'metadata-match');assert.equal(events.length,2);assert.equal(events[1][1],'proposeOutcome=metadata-matched\n');
 assert.equal(r.report.releaseReady,false);assert.equal(r.report.authorized,false);assert.equal(r.report.productionAdopted,false);
 assert.equal(r.record.snapshot.commitLog.filter(x=>x.stageId==='proposal-bootstrap-capture').length,1);
});
test('writer program keeps uncertain create PR GET-only and emits the distinct negative signal',async()=>{
 const run=entry(),f=await rolloverProposalFixture({prStatus:503,prApply:true}),events=[],r=await run({...f.makeInvocation(),appendSummary:async()=>{},appendOutput:async t=>events.push(t)});
 assert.equal(r.status,'rollover-proposal-verify-only');assert.deepEqual(events,['proposeOutcome=hold-proposal-uncertain\n']);
 assert.equal(f.prCreates.length,1);assert.equal(r.report.prSubmission,'uncertain');assert.equal(r.report.releaseReady,false);assert.equal(r.report.authorized,false);
});
