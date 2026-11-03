import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
import {createFoottraceInspectionTransport,createFoottraceTransport} from './foottrace-transport.mjs';
import {isOpaqueCredential} from '../http-credential.cjs';
const fail=()=>{throw new Error('proposal-invocation-unavailable');};
function number(value){
 if(typeof value!=='string'||! /^[1-9][0-9]{0,15}$/.test(value)||!Number.isSafeInteger(Number(value)))fail();
 return Number(value);
}
/** Trusted Actions entry capture only, NOT authentication of an arbitrary
 * process/environment. Credentials are captured once by the sealed read client
 * and removed before any CODE host I/O or provider await. No key/token returns.
 * The independently trusted actual bridge and bounded writer are still separate.
 */
export function captureFoottraceProposalInvocation(options={}){
 return captureInvocation(options,createFoottraceInspectionTransport);
}
/** Private source-CODE entry for the closed metadata controller. This captures
 * the separate existing writer token, not a read-owner promotion or grant.
 * Actual reviewed host/profile/output-to-client admission and every native
 * effect predicate remain required; DATA cannot select this constructor.
 */
export function captureFoottraceMetadataWriterInvocation(options={}){
 return captureInvocation(options,createFoottraceTransport);
}
function captureInvocation({env,fetcher,limits},createTransport){
 try{
  const token=own(env,'GH_TOKEN'),jwt=own(env,'APP_JWT');
  if(!isOpaqueCredential(token)||!isOpaqueCredential(jwt)||own(env,'APP_PRIVATE_KEY')!==undefined)fail();
  const context=foottraceInvocationContext({repository:{id:number(own(env,'REPO_ID')),full_name:own(env,'REPO_NAME')},
   sha:own(env,'SOURCE_SHA'),ref:own(env,'SOURCE_REF'),eventName:own(env,'EVENT_NAME'),
   runId:number(own(env,'RUN_ID')),runAttempt:number(own(env,'RUN_ATTEMPT'))});
  for(const [alias,original] of [['GITHUB_REPOSITORY_ID','REPO_ID'],['GITHUB_REPOSITORY','REPO_NAME'],['GITHUB_SHA','SOURCE_SHA'],
   ['GITHUB_WORKFLOW_SHA','SOURCE_SHA'],['GITHUB_REF','SOURCE_REF'],['GITHUB_EVENT_NAME','EVENT_NAME'],
   ['GITHUB_RUN_ID','RUN_ID'],['GITHUB_RUN_ATTEMPT','RUN_ATTEMPT']])if(own(env,alias)!==own(env,original))fail();
  const toolSha=own(env,'TOOL_SHA'),workflowRef=own(env,'GITHUB_WORKFLOW_REF');
  if(own(env,'GITHUB_ACTIONS')!=='true'||own(env,'GITHUB_JOB')!=='proposal'||
   workflowRef!=='footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main'||
   typeof toolSha!=='string'||! /^[a-f0-9]{40}$/.test(toolSha))fail();
  const artifactId=number(own(env,'ARTIFACT_ID'));
  const transport=createTransport({repository:context.repository,token,appIdentity:{
   slug:own(env,'APP_SLUG'),clientId:own(env,'APP_CLIENT_ID'),jwt},fetcher,limits});
  return Object.freeze({transport,context,artifactId,invocation:fields(jsonData({job:'proposal',workflowRef,
   workflowSha:context.sha,toolSha}),['job','workflowRef','workflowSha','toolSha'])});
 }catch{fail();}
 finally{
  try{delete env.APP_PRIVATE_KEY;delete env.APP_JWT;delete env.GH_TOKEN;}catch{fail();}
 }
}
