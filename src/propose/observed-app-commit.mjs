import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fields,jsonData,id,text,array} from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('observed-app-commit-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sha=v=>{if(!control.validSha(v))fail();return v;};
const identityFields=['repositoryId','sourceSha','sourceTree','runId','runAttempt','prepareJobId','proposalJobId','appId','botId','appSettingsDigest'];
/** Provider-resolved signed App commit observation only. Native current identity
 * is independently reacquired before/after EACH REST read. The matching tree
 * fact selects no effect and attributes no historical producer. The host owns
 * a bounded GET port; exact ref/PR/source/date/queue/history/writer eligibility
 * still belongs to the surrounding Propose flow. Saved records are not input.
 */
export function createObservedAppCommitReader({api,repository,settings,readCurrentProposer}) {
 const repo=fields(jsonData(repository),['id','full_name']);id(repo.id);
 text(repo.full_name,/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,201);
 const app=fields(jsonData(settings),['slug','clientId']);text(app.slug,/^[a-z0-9-]+$/,100);text(app.clientId,/^[A-Za-z0-9_.-]+$/,128);
 if(typeof api!=='function'||typeof readCurrentProposer!=='function')fail();
 return async(prepared,pending,current)=>{
  const observations=[];
  try{
   if(own(prepared,'valid')!==true||own(pending,'valid')!==true||own(pending,'scope')!=='pending-reference-only'||
    own(pending,'authorized')!==false||own(pending,'retainedEligibilityAdmitted')!==false)fail();
   const source=sha(own(prepared,'sourceSha')),sourceTree=sha(own(prepared,'sourceTree')),targetTree=sha(own(prepared,'targetTree'));
   const ref=fields(jsonData(own(pending,'reference')),['pr','botId','head','tree','source','observedBase','parents']);
   id(ref.pr);id(ref.botId);sha(ref.head);sha(ref.tree);sha(ref.observedBase);
   array(ref.parents,2);if(ref.parents.length<1||new Set(ref.parents).size!==ref.parents.length)fail();
   for(const parent of ref.parents)sha(parent);
   if(ref.source!==source||ref.head===source)fail();
   const admitIdentity=raw=>{
    if(own(raw,'valid')!==true||own(raw,'scope')!=='current-proposer-identity-only'||
     own(raw,'privateAppIdentityAdmitted')!==true||own(raw,'authorized')!==false||
     own(raw,'writerCredentialBindingAdmitted')!==false||own(raw,'retainedEligibilityAdmitted')!==false)fail();
    const v=fields(jsonData(own(raw,'identity')),identityFields);
    for(const key of ['repositoryId','runId','runAttempt','prepareJobId','proposalJobId','appId','botId'])id(v[key]);
    if(v.runAttempt>8||v.repositoryId!==repo.id||v.sourceSha!==source||v.sourceTree!==sourceTree||
     v.botId!==ref.botId||v.appSettingsDigest!==digest(app)||own(raw,'digest')!==digest(v))fail();
    return v;
   };
   const expected=admitIdentity(current),botLogin=app.slug+'[bot]';
   const actor=raw=>{
    const value={id:id(own(raw,'id')),login:own(raw,'login'),type:own(raw,'type')};
    if(value.id!==expected.botId||value.login!==botLogin||value.type!=='Bot')fail();
    return value;
   };
   const freshIdentity=async()=>{
    const v=admitIdentity(await readCurrentProposer(prepared));
    if(!isDeepStrictEqual(v,expected))fail();
   };
   const phase=async()=>{
    await freshIdentity();
    const row={kind:'provider-resolved-app-commit',method:'GET',status:'unavailable'};observations.push(row);
    const raw=own(await api('GET','/repos/'+repo.full_name+'/commits/'+ref.head),'data');
    const commit=own(raw,'commit'),verification=own(commit,'verification'),parents=array(own(raw,'parents'),2);
    const v={head:sha(own(raw,'sha')),tree:sha(own(own(commit,'tree'),'sha')),parents:parents.map(p=>sha(own(p,'sha'))),
     author:actor(own(raw,'author')),committer:actor(own(raw,'committer')),verified:own(verification,'verified'),reason:own(verification,'reason')};
    if(v.head!==ref.head||v.tree!==ref.tree||!isDeepStrictEqual(v.parents,ref.parents)||
     v.verified!==true||v.reason!=='valid')fail();
    row.status='projected';row.digest=digest(v);
    await freshIdentity();
    return jsonData(v);
   };
   const before=await phase(),after=await phase();if(!isDeepStrictEqual(before,after))fail();
   const reference=jsonData({repositoryId:repo.id,sourceSha:source,sourceTree,pr:ref.pr,head:ref.head,tree:ref.tree,parents:ref.parents,
    appId:expected.appId,botId:expected.botId,botLogin,verified:true,reason:'valid',currentIdentityDigest:digest(expected)});
   return Object.freeze({valid:true,scope:'observed-app-commit-only',reference,digest:digest(reference),sameTargetTree:ref.tree===targetTree,
    currentIdentityReferenceBound:true,originalProducerAttributed:false,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,
    authorized:false,adjacentSnapshotOnly:true,observations:Object.freeze(observations.map(Object.freeze))});
  }catch{return Object.freeze({valid:false,reason:'observed-app-commit-unavailable',authorized:false,
   observations:Object.freeze(observations.map(Object.freeze))});}
 };
}
