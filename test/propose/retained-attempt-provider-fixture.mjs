import {createHash} from 'node:crypto';
import {createRetainedWorkflowReader} from '../../src/propose/retained-workflows.mjs';
import {createRetainedSourceVersionReader} from '../../src/propose/retained-source-versions.mjs';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {createFoottraceRetainedAttemptProfile} from '../../src/propose/foottrace-profile.mjs';
import {proposerFixture} from './proposer-provider-fixture.mjs';
export const PRIVATE='PRIVATE-RETAINED-ATTEMPT-INPUT';
export const attemptProfile=createFoottraceRetainedAttemptProfile();
export async function retainedAttemptFixture({change=()=>{},publishedPredecessor=false}={}) {
 const proposer=proposerFixture(),prepared=proposer.prepared,current=await createFoottraceProposerReader(proposer)(prepared),calls=[];
 const repository=proposer.context.repository,wf=Object.fromEntries(['workflowPath','events','jobNames','effectJobNames'].map(k=>[k,attemptProfile[k]]));
 const run=id=>({id,workflow_id:11,run_attempt:1,head_sha:id===500?prepared.sourceSha:(publishedPredecessor?prepared.predecessor.merge:prepared.preparationRefs[0].sourceSha),
  head_branch:'main',event:'push',path:wf.workflowPath,status:id===500?'in_progress':'completed',conclusion:id===500?null:'success',repository,head_repository:repository});
 const api=async(method,route)=>{
  calls.push(route);let data;
  if(route.endsWith('/actions/workflows/publish.yml'))data={id:11,path:wf.workflowPath,state:'active'};
  else if(route.includes('/actions/workflows/11/runs?'))data={total_count:2,workflow_runs:[run(100),run(500)]};
  else if(/\/attempts\/1$/.test(route))data=run(Number(route.match(/runs\/(\d+)/)[1]));
  else if(route.includes('/jobs?')){
   const id=Number(route.match(/runs\/(\d+)/)[1]),source=run(id).head_sha;
   const job=(name,index)=>({id:id===500?599+index:1000+index,name,run_id:id,run_attempt:1,head_sha:source,
    status:id===500&&name==='proposal'?'in_progress':'completed',
    conclusion:id===500&&name==='proposal'?null:['plan','prepare','proposal'].includes(name)?'success':'skipped',private:PRIVATE});
   data={total_count:wf.jobNames.length,jobs:wf.jobNames.map(job)};
  }else if(route.includes('/artifacts?')){
   const id=Number(route.match(/runs\/(\d+)/)[1]);data={total_count:1,artifacts:[{id:id===500?800:900,name:'foottrace-123-'+id+'-1-prepare',size_in_bytes:1000,expired:false,
    workflow_run:{id,head_sha:run(id).head_sha,repository_id:repository.id,head_repository_id:repository.id}}]};
  }else if(route.includes('/contents/package.json?ref=')){
   const bytes=Buffer.from(JSON.stringify({name:'foottrace',version:prepared.fromVersion})),sha=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
   data={type:'file',name:'package.json',path:'package.json',encoding:'base64',size:bytes.length,sha,content:bytes.toString('base64')};
  }else throw new Error('fixture-route');
  change(data,route);return {data};
 };
 const collection=await createRetainedWorkflowReader({api,repository,profile:wf})();
 const versions=await createRetainedSourceVersionReader({api,repository,packageName:'foottrace',profile:wf,candidateScope:'pending-chain'})(prepared,collection);
 const archive={reference:{artifactId:800,jobId:600,repositoryId:repository.id,runId:500,runAttempt:1,sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,
  targetTree:prepared.targetTree,version:prepared.version,archiveDigest:'f'.repeat(64),bytes:1000,proposerDigest:current.digest}};
 const published={predecessor:prepared.predecessor,version:prepared.fromVersion,tree:prepared.predecessor.tree,archiveDigest:'a'.repeat(64),producer:{runId:100,runAttempt:1}};
 return {published,prepared,collection:JSON.parse(JSON.stringify(collection)),versions,current,archive,profile:attemptProfile,calls};
}
