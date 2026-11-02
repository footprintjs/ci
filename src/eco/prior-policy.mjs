import { createHash } from 'node:crypto';
import {jsonData,parseLedgerText,fields,text,id,array,unique,invalid} from './json-data.mjs';
import {validatePolicy,isValidatedPolicy} from './ledger-schema.mjs';
const SHA=/^[a-f0-9]{40}$/,DIGEST=/^[a-f0-9]{64}$/;const bound=new WeakSet();
const fail=code=>{const e=new Error(code);e.code=code;throw e;};
/** Bind separately pinned operator trust to a fresh provider observation of
 * PRIOR main, never a policy declared by the candidate itself. This does not
 * authenticate an AI, approve a ledger change, or authorize an effect.
 * Source/lineage provenance must be supplied by the trusted read-only driver.
 */
export function bindPriorPolicy(body,rawAnchor,rawEvidence) {
 if(rawAnchor===null||rawAnchor===undefined)fail('policy-unanchored');
 const anchor=jsonData(rawAnchor),e=jsonData(rawEvidence);
 fields(anchor,['repository','commit','bodySha256','ownerId']);
 fields(e,['repository','ref','commit','anchorCommit','anchorAncestor','candidateRepository','candidateHead','candidateBase']);
 if(anchor.repository!=='footprintjs/ci'||e.repository!==anchor.repository||e.ref!=='refs/heads/main')fail('policy-stale');
 for(const v of [anchor.commit,e.commit,e.anchorCommit,e.candidateHead,e.candidateBase])text(v,SHA,40);
 text(anchor.bodySha256,DIGEST,64);id(anchor.ownerId);text(e.candidateRepository,/^footprintjs\/[A-Za-z0-9_.-]{1,100}$/);
 if(e.anchorCommit!==anchor.commit||e.anchorAncestor!==true||
  (e.candidateRepository==='footprintjs/ci'&&(e.commit!==e.candidateBase||e.commit===e.candidateHead)))fail('policy-stale');
 if(typeof body!=='string'||Buffer.byteLength(body)>1024*1024||createHash('sha256').update(body).digest('hex')!==anchor.bodySha256)fail('policy-stale');
 const policy=validatePolicy(parseLedgerText(body));if(policy.ownerId!==anchor.ownerId)fail('policy-stale');
 const result=Object.freeze({policy,anchor,observation:e,attribution:'cooperative-owner-account'});bound.add(result);return result;
}
export const isBoundPriorPolicy=value=>bound.has(value);
export function priorProfile(context,repositoryId,repository) {
 if(!isBoundPriorPolicy(context))fail('policy-unanchored');
 const p=context.policy.repositories.find(p=>p.id===repositoryId&&p.repository===repository);
 if(!p)fail('policy-repository-missing');return p;
}
/** Shape+known-inventory check only; this does not seed or write a live ledger. */
export function checkRetainedMinimums(policy,rawMinimums) {
 if(!isValidatedPolicy(policy))fail('policy-unanchored');
 const minimums=jsonData(rawMinimums);fields(minimums,['complete','repositories']);
 if(minimums.complete!==true||!Array.isArray(minimums.repositories))fail('policy-inventory-incomplete');
 array(minimums.repositories,128);for(const row of minimums.repositories)if(!row||typeof row!=='object'||Array.isArray(row))invalid();unique(minimums.repositories,x=>x.repository);
 for(const expected of minimums.repositories){
  fields(expected,['repository','held','holdRefs','approvalProfile','gates']);
  text(expected.repository,/^footprintjs\/[A-Za-z0-9_.-]{1,100}$/);if(typeof expected.held!=='boolean'||!['structured-owner-comment','foottrace-disclosed-user'].includes(expected.approvalProfile))invalid();
  unique(array(expected.holdRefs,128));for(const ref of expected.holdRefs)text(ref,DIGEST,64);
  array(expected.gates,64);for(const gate of expected.gates){fields(gate,['name','appId']);text(gate.name,/^[^\x00-\x1f\x7f]+$/,128);id(gate.appId);}unique(expected.gates,g=>g.name);
  const p=policy.repositories.find(p=>p.repository===expected.repository);
  if(!p||typeof expected.held!=='boolean'||!Array.isArray(expected.holdRefs)||!Array.isArray(expected.gates))fail('policy-minimums-lost');
  if(expected.held&&!p.held||p.approvalProfile!==expected.approvalProfile||
   expected.holdRefs.some(ref=>!p.holds.some(h=>h.ref===ref))||
   expected.gates.some(g=>!p.gates.some(x=>x.name===g.name&&x.appId===g.appId)))fail('policy-minimums-lost');
 }
 return true;
}
