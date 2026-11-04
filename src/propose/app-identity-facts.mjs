import {fields,jsonData,id,text} from '../eco/json-data.mjs';
import {foottraceInvocationContext} from './foottrace-context.mjs';
const names=['schemaVersion','verified','appId','appSlug','clientId','ownerId','ownerLogin','ownerType',
 'repositoryId','sourceSha','runId','runAttempt'];
const fail=()=>{throw new Error('app-identity-facts-unavailable');};
/** Owned cached key-holder observation, NOT authentication of supplied JSON or
 * a process, fresh private-App acquisition, writer permission or a saved grant.
 * The reviewed workflow/helper/source/profile bridge remains independently owed.
 */
export function bindAppIdentityFacts(input,{repository,slug,clientId,context}={}){
 try{
  const v=fields(jsonData(input,4096),names);
  if(repository?.full_name!=='footprintjs/foottrace')fail();id(repository.id);
  text(clientId,/^[A-Za-z0-9_.-]+$/,128);
  if(slug!=='agentfootprint-release'||v.schemaVersion!==1||v.verified!==true||
   v.appId!==5533048||v.appSlug!==slug||v.clientId!==clientId||v.ownerId!==266183199||
   v.ownerLogin!=='footprintjs'||v.ownerType!=='Organization'||v.repositoryId!==repository.id||
   typeof v.sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(v.sourceSha))fail();
  id(v.runId);id(v.runAttempt);if(v.runAttempt>8)fail();
  if(context!==undefined){
   const c=foottraceInvocationContext(context);
   if(c.repository.id!==v.repositoryId||c.sha!==v.sourceSha||c.runId!==v.runId||c.runAttempt!==v.runAttempt)fail();
  }
  return Object.freeze(Object.fromEntries(names.map(name=>[name,v[name]])));
 }catch{fail();}
}
/** Exactly the isolated helper's one compact output; bounds precede parsing,
 * duplicate keys/whitespace/alternate serialization cannot hide extra input.
 */
export function parseAppIdentityFacts(source,expected){
 try{
  if(typeof source!=='string'||Buffer.byteLength(source)>4096)fail();
  const value=bindAppIdentityFacts(JSON.parse(source),expected);
  if(JSON.stringify(value)!==source)fail();
  return value;
 }catch{fail();}
}
