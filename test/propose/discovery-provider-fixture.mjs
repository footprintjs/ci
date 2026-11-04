import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import preparation from '../../src/guards/release-prepare.cjs';
import {createRetainedWorkflowReader} from '../../src/propose/retained-workflows.mjs';
import {createFoottracePreparationProfile} from '../../src/propose/foottrace-profile.mjs';
import {chainFixture,preparationFixtureMembers} from './pending-chain-provider-fixture.mjs';
import {sourceFixture} from './prepared-fixtures.mjs';
import {zip} from './artifact-fixture.mjs';
import {createFoottracePendingObservationReader} from '../../src/propose/foottrace-pending.mjs';
export const PRIVATE='PRIVATE-DISCOVERY-PROVIDER-BODY';
export async function discoveryFixture({count=1,duplicates=0,change=()=>{}}={}) {
 const chain=chainFixture(count),cohorts=[...chain.witnesses],first=chain.witnesses[0],repository=first.evidence.expected.repository;
 for(let i=0;i<duplicates;i++){
  const copy=structuredClone(first),e=copy.evidence,parsed=preparationFixtureMembers(Buffer.from(e.archive));
  e.expected.runId+=100+i;e.expected.jobId+=100+i;e.expected.artifactId+=100+i;e.expected.artifactName='foottrace-'+repository.id+'-'+e.expected.runId+'-1-prepare';
  e.run.id=e.expected.runId;e.job.id=e.expected.jobId;e.job.run_id=e.expected.runId;e.artifact.id=e.expected.artifactId;e.artifact.name=e.expected.artifactName;e.artifact.workflow_run.id=e.expected.runId;
  parsed.manifest.runId=e.expected.runId;parsed.manifest.jobId=e.expected.jobId;
  e.archive=zip([['manifest.json',JSON.stringify(parsed.manifest)+'\n'],['proposal.json',JSON.stringify(parsed.proposal)+'\n']]);cohorts.push(copy);
 }
 const sources=new Map(chain.witnesses.flatMap(w=>[[w.originalSource.commit.sha,w.originalSource],[w.pendingSource.commit.sha,w.pendingSource]]));
 const current=sourceFixture();current.commit.sha='e'.repeat(40);sources.set(current.commit.sha,current);
 const wf={workflowPath:'.github/workflows/publish.yml',events:['push','workflow_dispatch','release'],jobNames:['prepare','proposal','authority','release','publish'],effectJobNames:['authority','release','publish']};
 const nativeProfile={id:'foottrace-next-v1',workflowPath:wf.workflowPath,prepareEvents:['push','workflow_dispatch'],prepareJobName:'prepare',artifactLayout:'run-attempt-job',artifactName:'foottrace',originalParentLaw:'published-predecessor',dateLaw:'source-committer-day'};
 const last=chain.witnesses.at(-1),context={repository,sha:current.commit.sha},settings={slug:'foottrace-release'};
 const candidate={id:41,number:41,state:'open',merged:false,merged_at:null,merge_commit_sha:null,auto_merge:null,updated_at:'2026-11-02T01:00:00Z',
  head:{sha:last.pendingSource.commit.sha,ref:'release/next',repo:repository},base:{sha:current.commit.sha,ref:'main',repo:repository},user:{id:500,type:'Bot'}};
 const calls=[],api=async(method,route,body)=>{
  assert.equal(method,'GET');assert.equal(body,undefined);calls.push(route);let data;
  const runId=Number(route.match(/actions\/runs\/(\d+)/)?.[1]),cohort=cohorts.find(w=>w.evidence.expected.runId===runId);
  if(route==='/repos/footprintjs/foottrace')data={...repository,default_branch:'main',archived:false};
  else if(route.startsWith('/users/'))data={id:500,type:'Bot',login:'foottrace-release[bot]'};
  else if(route.endsWith('/git/ref/heads/main'))data={object:{type:'commit',sha:current.commit.sha}};
  else if(route.endsWith('/git/ref/heads/release/next'))data={object:{type:'commit',sha:last.pendingSource.commit.sha}};
  else if(route.includes('/pulls?')){const row=structuredClone(candidate);delete row.merged;data=[row];}
  else if(route.endsWith('/pulls/41'))data=structuredClone(candidate);
  else if(route.endsWith('/actions/workflows/publish.yml'))data={id:11,path:wf.workflowPath,state:'active'};
  else if(route.includes('/actions/workflows/11/runs?'))data={total_count:cohorts.length,workflow_runs:cohorts.map(w=>({...w.evidence.run,workflow_id:11}))};
  else if(cohort&&route.endsWith('/attempts/1'))data={...cohort.evidence.run,workflow_id:11};
  else if(cohort&&route.includes('/attempts/1/jobs?'))data={total_count:1,jobs:[{...cohort.evidence.job}]};
  else if(cohort&&route.includes('/artifacts?'))data={total_count:1,artifacts:[{...cohort.evidence.artifact,size_in_bytes:cohort.evidence.archive.length}]};
  else if(/\/actions\/artifacts\/\d+$/.test(route)){
   const id=Number(route.split('/').at(-1)),w=cohorts.find(w=>w.evidence.expected.artifactId===id);assert.ok(w);
   data={...w.evidence.artifact,size_in_bytes:w.evidence.archive.length,digest:'sha256:'+createHash('sha256').update(w.evidence.archive).digest('hex')};
  }else if(route.endsWith('/zip')){
   const id=Number(route.split('/').at(-2)),w=cohorts.find(w=>w.evidence.expected.artifactId===id);assert.ok(w);data=Buffer.from(w.evidence.archive);
  }else if(route.includes('/git/commits/')){
   const source=sources.get(route.split('/').at(-1));assert.ok(source);data={...structuredClone(source.commit),parents:structuredClone(source.commit.parents??[])};
  }else if(route.includes('/git/trees/')){
   const oid=route.split('/git/trees/')[1].split('?')[0],source=[...sources.values()].find(s=>s.commit.tree.sha===oid);assert.ok(source);
   data={sha:oid,truncated:false,tree:[...source.inventory].map(([path,row])=>({path,sha:row.sha,mode:row.mode,type:'blob'}))};
  }else if(route.includes('/git/blobs/')){
   const oid=route.split('/').at(-1),row=[...sources.values()].flatMap(s=>[...s.inventory.values()]).find(r=>r.sha===oid);assert.ok(row?.bytes);
   data={sha:oid,encoding:'base64',size:row.bytes.length,content:Buffer.from(row.bytes).toString('base64')};
  }else throw new Error('fixture-route');
  if(!Buffer.isBuffer(data))data.private=PRIVATE;change(data,route);return {data};
 };
 const collection=await createRetainedWorkflowReader({api,repository,profile:wf})();
 const pending=await createFoottracePendingObservationReader({api,context,settings})();
 const lineage={valid:true,scope:'published-lineage-only',predecessor:first.predecessor,version:'1.10.0',authorized:false,privateAppIdentityAdmitted:false};
 return {api,repository,context,settings,nativeProfile,profile:createFoottracePreparationProfile(),collection,pending,lineage,chain,cohorts,calls,sources,current};
}
