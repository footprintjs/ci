import assert from 'node:assert/strict';
import {createFoottracePreparationProfile} from '../../src/propose/foottrace-profile.mjs';
import {createRefreshInputReader} from '../../src/propose/refresh-inputs.mjs';
import {createRetainedWorkflowReader} from '../../src/propose/retained-workflows.mjs';
import {preparationWitnessFixture} from './preparation-witness-fixture.mjs';
import {sourceFixture} from './prepared-fixtures.mjs';
import {chainFixture} from './pending-chain-provider-fixture.mjs';
export const PRIVATE='PRIVATE-WITNESS-PROVIDER-BODY';
export async function witnessProviderFixture({chainCount=1,change=()=>{}}={}) {
 const chain=chainCount===1?{witnesses:[preparationWitnessFixture()]}:chainFixture(chainCount),witness=chain.witnesses[0],e=witness.evidence.expected,repository=e.repository,currentSource=sourceFixture();currentSource.commit.sha='e'.repeat(40);
 const prepared=createRefreshInputReader(createFoottracePreparationProfile())({pending:{witnesses:chain.witnesses,predecessor:witness.predecessor},currentSource,currentPreparationDate:null});assert.equal(prepared.valid,true);
 const workflowProfile={workflowPath:'.github/workflows/publish.yml',events:['push','workflow_dispatch','release'],jobNames:['prepare','proposal','authority','release','publish'],effectJobNames:['authority','release','publish']};
 const profile={id:'foottrace-next-v1',workflowPath:workflowProfile.workflowPath,prepareEvents:['push','workflow_dispatch'],
  prepareJobName:'prepare',artifactLayout:'run-attempt-job',artifactName:'foottrace',originalParentLaw:'published-predecessor',dateLaw:'source-committer-day'};
 const calls=[],api=async(method,route,body)=>{
  calls.push({method,route,body});let data;
  const runId=Number(route.match(/actions\/runs\/(\d+)/)?.[1]),byRun=chain.witnesses.find(w=>w.evidence.expected.runId===runId);
  if(route.endsWith('/actions/workflows/publish.yml'))data={id:11,path:workflowProfile.workflowPath,state:'active'};
  else if(route.includes('/actions/workflows/11/runs?'))data={total_count:chain.witnesses.length,workflow_runs:chain.witnesses.map(w=>({...w.evidence.run,workflow_id:11}))};
  else if(byRun&&route.endsWith('/attempts/1'))data={...byRun.evidence.run,workflow_id:11};
  else if(route.includes('/attempts/1/jobs?'))data={total_count:1,jobs:[{...byRun.evidence.job}]};
  else if(byRun&&route.includes('/artifacts?'))data={total_count:1,artifacts:[{...byRun.evidence.artifact,size_in_bytes:byRun.evidence.archive.length}]};
  else if(route.includes('/git/commits/')){const commit=chain.witnesses.flatMap(w=>[w.originalSource.commit,w.pendingSource.commit]).find(c=>route.endsWith('/'+c.sha));if(!commit)throw new Error('fixture-commit');data=structuredClone(commit);}
  else if(route.endsWith('/zip')){const artifact=chain.witnesses.find(w=>route.endsWith('/'+w.evidence.artifact.id+'/zip'));if(!artifact)throw new Error('fixture-artifact');data=Buffer.from(artifact.evidence.archive);}
  else throw new Error('fixture-route');
  if(!Buffer.isBuffer(data))data.private=PRIVATE;change(data,route);return {data};
 };
 const collection=await createRetainedWorkflowReader({api,repository,profile:workflowProfile})();calls.length=0;
 return {api,repository,profile,prepared,collection,calls,witness,chain};
}
