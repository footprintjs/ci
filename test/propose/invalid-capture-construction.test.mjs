import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataC1Fixture} from './metadata-c1-provider-fixture.mjs';
import {runFoottraceProposal,runFoottraceProposalWithOutput} from '../../src/propose/foottrace-proposal.mjs';
import {runFoottracePendingRefresh,runFoottracePendingSuccessorPreparation} from '../../src/propose/foottrace-pending-successor.mjs';
import {runFoottraceRolloverRef,runFoottraceRolloverProposal,runFoottraceRolloverPreparation} from '../../src/propose/foottrace-rollover-successor.mjs';
import {runFoottraceMetadataReconciliationWithOutput} from '../../src/propose/foottrace-metadata-reconciliation.mjs';
const entries={runFoottraceProposal,runFoottraceProposalWithOutput,runFoottracePendingRefresh,runFoottracePendingSuccessorPreparation,
 runFoottraceRolloverRef,runFoottraceRolloverProposal,runFoottraceRolloverPreparation,runFoottraceMetadataReconciliationWithOutput};
for(const [name,run] of Object.entries(entries))for(const fault of ['foreign-job','missing-token'])test(name+' records native refusal without eager capture dereference: '+fault,async()=>{
 const f=await metadataC1Fixture({changeEnv:e=>{if(fault==='foreign-job')e.GITHUB_JOB='other';else delete e.GH_TOKEN;}});
 const input=f.makeInvocation(),events=[];let result;
 await assert.doesNotReject(async()=>{result=await run({...input,appendSummary:async()=>events.push('summary'),appendOutput:async()=>events.push('output')});});
 assert.equal(result.status,'technical-failure');assert.equal(result.record.complete,false);assert.equal(result.report.releaseReady,false);
 assert.equal(f.calls.length,0);assert.equal(f.patches.length,0);assert.deepEqual(events,[]);
 assert.equal('GH_TOKEN' in input.env,false);
 const ids=result.record.snapshot.commitLog.map(x=>x.stageId);assert.equal(ids.filter(x=>x==='proposal-bootstrap-capture').length,1);
 assert.equal(ids.some(x=>x.includes('pre-effect')),false);
});
