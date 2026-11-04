export const PRIVATE='PRIVATE-WORKFLOW-BODY';
export function fixture({runs=1,attempts=2,change=()=>{}}={}) {
 const repository={id:123,full_name:'footprintjs/foottrace'}, sha='a'.repeat(40), calls=[];
 const profile={workflowPath:'.github/workflows/publish.yml',events:['push','workflow_dispatch','release'],
  jobNames:['plan','prepare','proposal','authority','verdict','gates','build','release','publish','verify'],
  effectJobNames:['authority','release','publish']};
 const run=(i,n=attempts)=>({id:100+i,workflow_id:11,run_attempt:n,head_sha:sha,head_branch:'main',event:'push',path:profile.workflowPath,
  status:'completed',conclusion:'success',repository,head_repository:repository,private:PRIVATE});
 let phase=0;
 const api=async(method,route,body)=>{
  calls.push({method,route,body});let data;
  if(route.endsWith('/actions/workflows/publish.yml')){phase++;data={id:11,path:profile.workflowPath,state:'active',private:PRIVATE};}
  else if(route.includes('/actions/workflows/11/runs?'))data={total_count:runs,workflow_runs:Array.from({length:runs},(_,i)=>run(i))};
  else if(/\/attempts\/\d+\?/.test(route))throw new Error('fixture-attempt-route');
  else if(/\/attempts\/\d+$/.test(route)){const m=route.match(/runs\/(\d+)\/attempts\/(\d+)/);data=run(Number(m[1])-100,Number(m[2]));}
  else if(route.includes('/jobs?')){const m=route.match(/runs\/(\d+)\/attempts\/(\d+)/);data={total_count:2,jobs:[
   {id:1000+Number(m[1])*20+Number(m[2])*2,name:'prepare',run_id:Number(m[1]),run_attempt:Number(m[2]),head_sha:sha,status:'completed',conclusion:'success',private:PRIVATE},
   {id:1001+Number(m[1])*20+Number(m[2])*2,name:'publish',run_id:Number(m[1]),run_attempt:Number(m[2]),head_sha:sha,status:'completed',conclusion:'skipped',private:PRIVATE}]};}
  else if(route.includes('/artifacts?')){const n=Number(route.match(/runs\/(\d+)/)[1]);data={total_count:1,artifacts:[
   {id:2000+n,name:'prepare-'+n,expired:false,size_in_bytes:12,workflow_run:{id:n,head_sha:sha,repository_id:123,head_repository_id:123},private:PRIVATE}]};}
  else throw new Error('fixture-route');
  change(data,route,{phase});return {data};
 };
 return {api,repository,profile,calls,sha};
}
