import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import native from '../../src/guards/release-github.cjs';
import preparation from '../../src/guards/release-prepare.cjs';
import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
import {nativeHttpFixture} from './native-http-provider-fixture.mjs';
import {zip} from './artifact-fixture.mjs';
export const PRIVATE='PRIVATE-COHERENT-BOOTSTRAP-PROVIDER';
export async function bootstrapFixture({change=()=>{},extend=true,duplicate=false,changeCurrent=()=>{},changeHttp=()=>{},retainedJobs='prepare-only'}={}) {
 const model=managedReleaseFixture({published:true}),B=model.context.sha,repo=model.repository;
 const original=await native.sourceInput(model.api,model.context),oldPrepared=preparation.prepareRelease({files:original.files,fragments:original.fragments,date:original.date});
 const target=new Map(model.trees.get(original.commit.tree.sha));
 for(const [path,text] of Object.entries(oldPrepared.updates)){const bytes=Buffer.from(text);target.set(path,{bytes,mode:'100644',sha:preparation.gitObject('blob',bytes)});}
 for(const path of oldPrepared.deletions)target.delete(path);
 const P=model.addCommit(target,[B,model.originalHead]);model.tip=P;
 const pending={id:1101,number:101,state:'open',merged:false,merged_at:null,merge_commit_sha:null,auto_merge:null,updated_at:'2026-11-01T01:00:00Z',
  user:{...model.bot},head:{sha:P,ref:'release/next',repo},base:{sha:B,ref:'main',repo}};
 model.pulls.push(pending);
 if(extend)model.advance(inventory=>{if(extend!=='empty'){const bytes=Buffer.from('---\ntype: added\nbump: minor\n---\n\n- A new fixture fragment.\n');inventory.set('.changes/second.md',{bytes,mode:'100644',sha:preparation.gitObject('blob',bytes)});}changeCurrent(inventory);});
 const M=model.context.sha,current=await native.sourceInput(model.api,model.context),currentPrepared=preparation.prepareRelease({files:current.files,fragments:current.fragments,date:current.date});
 const cohort=(runId,sourceSha,sourceTree,prepared,jobId,artifactId,currentRun=false)=>{
  const run={id:runId,workflow_id:11,run_attempt:1,head_sha:sourceSha,head_branch:'main',event:'push',path:'.github/workflows/publish.yml',
   status:currentRun?'in_progress':'completed',conclusion:currentRun?null:'success',repository:repo,head_repository:repo};
  const job=(id,name,status='completed',conclusion='success')=>({id,name,run_id:runId,run_attempt:1,head_sha:sourceSha,status,conclusion});
  const jobs=currentRun?[job(550,'plan'),job(jobId,'prepare'),job(650,'proposal','in_progress',null),
   ...['authority','verdict','gates','build','release','publish','verify'].map((name,i)=>job(660+i,name,'queued',null))]:retainedJobs==='full-native'?['plan','prepare','proposal','authority','verdict','gates','build','release','publish','verify'].map((name,i)=>
    job(name==='prepare'?jobId:100000+runId*100+i,name,'completed',['plan','prepare','proposal'].includes(name)?'success':'skipped')):[job(jobId,'prepare')];
  const bytes=zip([['manifest.json',JSON.stringify({repositoryId:repo.id,runId,runAttempt:1,jobId,sourceSha,tree:sourceTree,package:'foottrace',version:prepared.version})+'\n'],
   ['proposal.json',JSON.stringify({base:sourceSha,tree:sourceTree,repository:repo,prepared})+'\n']]);
  const artifact={id:artifactId,name:'foottrace-'+repo.id+'-'+runId+'-1-prepare',expired:false,size_in_bytes:bytes.length,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),
   workflow_run:{id:runId,repository_id:repo.id,head_repository_id:repo.id,head_sha:sourceSha,head_branch:'main'}};
  return {run,jobs,bytes,artifact};
 };
 const cohorts=[cohort(456,B,original.commit.tree.sha,oldPrepared,789,900),cohort(500,M,current.commit.tree.sha,currentPrepared,600,800,true)];
 // The published L marker belongs to its own terminal invocation, not the
 // current M producer. Keep the native publication/history world coherent.
 const publishedRunId=JSON.parse([...model.releases.values()][0].assets[0].raw).runId;
 const publishedRun={id:publishedRunId,workflow_id:11,run_attempt:1,head_sha:model.originalMerge,head_branch:'main',event:'push',
  path:'.github/workflows/publish.yml',status:'completed',conclusion:'success',repository:repo,head_repository:repo};
 const publishedJobs=['plan','prepare','proposal','authority','verdict','gates','build','release','publish','verify'].map((name,i)=>({
  id:40000+i,name,run_id:publishedRunId,run_attempt:1,head_sha:model.originalMerge,status:'completed',
  conclusion:['prepare','proposal'].includes(name)?'skipped':'success'}));
 cohorts.unshift({run:publishedRun,jobs:publishedJobs,artifact:null,bytes:null});
 if(duplicate)cohorts.push(cohort(457,B,original.commit.tree.sha,oldPrepared,790,901));
 const calls=[],api=async(method,route,body)=>{
  assert.equal(method,'GET');calls.push(route);const u=new URL('https://api.github.com'+route),p=u.pathname;let data;
  const runId=Number(p.match(/actions\/runs\/(\d+)/)?.[1]),c=cohorts.find(c=>c.run.id===runId),aid=Number(p.match(/actions\/artifacts\/(\d+)/)?.[1]),a=cohorts.find(c=>c.artifact?.id===aid);
  if(p==='/repos/footprintjs/foottrace')data={...repo,archived:false,default_branch:'main',permissions:{push:true}};
  else if(p.endsWith('/actions/workflows/publish.yml'))data={id:11,path:'.github/workflows/publish.yml',state:'active'};
  else if(p.endsWith('/actions/workflows/11/runs'))data={total_count:cohorts.length,workflow_runs:cohorts.map(c=>structuredClone(c.run))};
  else if(c&&(p.endsWith('/attempts/1')||p.endsWith('/actions/runs/'+runId)))data=structuredClone(c.run);
  else if(c&&p.endsWith('/attempts/1/jobs'))data={total_count:c.jobs.length,jobs:structuredClone(c.jobs)};
  else if(c&&p.endsWith('/artifacts'))data={total_count:c.artifact?1:0,artifacts:c.artifact?[structuredClone(c.artifact)]:[]};
  else if(a&&p.endsWith('/zip'))data=Buffer.from(a.bytes);
  else if(a&&p.endsWith('/actions/artifacts/'+aid))data=structuredClone(a.artifact);
  else if(p.endsWith('/pulls')&&u.searchParams.get('state')==='all')data=structuredClone(model.pulls);
  else if(p.endsWith('/pulls/101/reviews'))data=[];
  else if(p.endsWith('/contents/package.json')){
   const commit=model.commits.get(u.searchParams.get('ref')),row=model.trees.get(commit?.tree.sha)?.get('package.json');assert.ok(row);
   data={type:'file',name:'package.json',path:'package.json',encoding:'base64',sha:row.sha,size:row.bytes.length,content:row.bytes.toString('base64')};
  }
  else if(p.endsWith('/releases'))data=structuredClone([...model.releases.values()].map(({assets,...r})=>r));
  else if(p.includes('/git/ref/tags/')){
   const tag=decodeURIComponent(p.split('/git/ref/tags/')[1]),sha=model.tags.get(tag);
   if(!sha)throw Object.assign(new Error('OFFLINE tag absent'),{status:404});
   data={ref:'refs/tags/'+tag,object:{sha,type:'commit'}};
  }
  else if(p.endsWith('/tags'))data=[...model.tags].map(([name,sha])=>({name,commit:{sha}}));
  else data=(await model.api(method,route,body)).data;
  if(!Buffer.isBuffer(data)&&data!==null&&typeof data==='object')data.private=PRIVATE;
  change(data,route);return {data};
 };
 const http=nativeHttpFixture({model,api,change:changeHttp});
 return {...http,api,calls,cohorts,B,M,P,original,current,oldPrepared,currentPrepared,pending};
}
