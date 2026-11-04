import { createHash } from 'node:crypto';
import { createRetainedWorkflowReader } from '../../src/propose/retained-workflows.mjs';
import { fixture as workflowFixture, PRIVATE } from './retained-workflow-provider-fixture.mjs';
export { PRIVATE };
export async function sourceVersionFixture({runs=1,workflowChange=()=>{},packageChange=()=>{},version='1.0.0'}={}) {
 const w=workflowFixture({runs,change:workflowChange}),collection=await createRetainedWorkflowReader(w)(),calls=[];
 const prepared={valid:true,version:'1.2.0',fromVersion:'1.1.0',preparationRefs:[{version:'1.1.1'}]};
 const api=async(method,route,body)=>{
  calls.push({method,route,body});const bytes=Buffer.from(JSON.stringify({name:'foottrace',version,private:PRIVATE}));
  const blob=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
  const data={type:'file',name:'package.json',path:'package.json',encoding:'base64',size:bytes.length,sha:blob,content:bytes.toString('base64'),private:PRIVATE};
  packageChange(data,route);return {data};
 };
 return {candidateScope:'pending-chain',api,repository:w.repository,packageName:'foottrace',profile:w.profile,collection,prepared,calls};
}
