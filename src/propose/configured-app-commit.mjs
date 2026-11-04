import {isDeepStrictEqual} from 'node:util';
import {fields,jsonData,id,text,array} from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('observed-app-commit-unavailable');};
const sha=v=>{if(!control.validSha(v))fail();return v;};
/** Shared provider-resolved actor/signature/tree/ordered-parent decoder.
 * Pure observed DATA, not original-creator attribution or writer permission.
 * Raw Git names/emails, messages, signature and payload are never returned.
 */
export function bindConfiguredAppCommit(raw,input){
 const expected=fields(jsonData(input),['head','tree','parents','botId','botLogin']);
 sha(expected.head);sha(expected.tree);id(expected.botId);
 text(expected.botLogin,/^[a-z0-9-]+\[bot\]$/,105);
 array(expected.parents,2);if(!expected.parents.length||new Set(expected.parents).size!==expected.parents.length)fail();
 for(const parent of expected.parents)sha(parent);
 const actor=raw=>{
  const value={id:id(own(raw,'id')),login:own(raw,'login'),type:own(raw,'type')};
  if(value.id!==expected.botId||value.login!==expected.botLogin||value.type!=='Bot')fail();return value;
 };
 const commit=own(raw,'commit'),verification=own(commit,'verification'),parents=array(own(raw,'parents'),2);
 const v={head:sha(own(raw,'sha')),tree:sha(own(own(commit,'tree'),'sha')),parents:parents.map(p=>sha(own(p,'sha'))),
  author:actor(own(raw,'author')),committer:actor(own(raw,'committer')),verified:own(verification,'verified'),reason:own(verification,'reason')};
 if(v.head!==expected.head||v.tree!==expected.tree||!isDeepStrictEqual(v.parents,expected.parents)||v.verified!==true||v.reason!=='valid')fail();
 return Object.freeze(jsonData(v));
}
