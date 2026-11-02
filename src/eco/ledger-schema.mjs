import schema from '../../schemas/ledger.schema.json' with { type:'json' };
import { jsonData, fields, text, id, array, unique, invalid } from './json-data.mjs';
const defs=schema.$defs;
const pattern=name=>new RegExp(defs[name].pattern);
const regex=Object.freeze(Object.fromEntries(['sha','digest','repository','package','version','gateName','workId'].map(name=>[name,pattern(name)])));
const keys=name=>defs[name].required;
const value=(name,v)=>text(v,regex[name],defs[name]['x-maxUtf8Bytes']??defs[name].maxLength??200);
const choice=(name,v)=>{if(!defs[name].enum.includes(v))invalid();return v;};
const flag=v=>{if(typeof v!=='boolean')invalid();return v;};
const rows=(v,max,key)=>{const items=array(v,max);for(const item of items)if(!item||typeof item!=='object'||Array.isArray(item))invalid();return unique(items,key);};
const refs=v=>{unique(array(v));for(const x of v)value('digest',x);};
const normalize=raw=>jsonData(raw);
const policies=new WeakSet();
/** Shape admission only. A policy needs a separately pinned PRIOR trust anchor. */
export function validatePolicy(raw) {
 const p=normalize(raw);fields(p,keys('policy'));
 if(p.schemaVersion!==1||p.verdictRequired!==true||p.noForce!==true)invalid();id(p.ownerId);flag(p.releasesPaused);
 const repositories=rows(p.repositories,128,r=>r.repository);if(!repositories.length)invalid();unique(repositories,r=>r.id);
 for(const r of repositories){
  fields(r,keys('repoPolicy'));id(r.id);value('repository',r.repository);value('package',r.package);flag(r.held);choice('profile',r.approvalProfile);
  for(const h of rows(r.holds,128,h=>h.ref)){fields(h,keys('hold'));choice('holdKind',h.kind);value('digest',h.ref);}
  if(!r.held&&r.holds.length)invalid();
  if(!array(r.actions,3).length)invalid();unique(r.actions);for(const a of r.actions)choice('action',a);
  if(!rows(r.gates,64,g=>g.name).length)invalid();for(const g of r.gates){fields(g,keys('gate'));value('gateName',g.name);id(g.appId);}
 }
 policies.add(p);return p;
}
export const isValidatedPolicy=value=>policies.has(value);
export function validateVersions(raw) {
 const p=normalize(raw);fields(p,keys('versions'));if(p.schemaVersion!==1)invalid();
 for(const r of rows(p.items,128,r=>r.repository)){
  fields(r,keys('versionItem'));value('repository',r.repository);if(r.desiredVersion!==null)value('version',r.desiredVersion);
  if(r.candidate!==null){fields(r.candidate,keys('candidate'));value('sha',r.candidate.head);value('version',r.candidate.version);}
  refs(r.intentRefs);refs(r.reservationRefs);
 }
 return p;
}
export function validateWork(raw) {
 const p=normalize(raw);fields(p,keys('work'));if(p.schemaVersion!==1)invalid();
 for(const r of rows(p.items,512,r=>r.id)){
  fields(r,keys('workItem'));value('workId',r.id);value('repository',r.repository);choice('action',r.action);choice('workState',r.state);
  if(r.head!==null)value('sha',r.head);refs(r.receiptRefs);
 }
 return p;
}
