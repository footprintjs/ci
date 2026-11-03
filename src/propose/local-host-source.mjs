import {fields,jsonData} from '../eco/json-data.mjs';
import {keys,own} from './source-inventory.mjs';
/** Backend-owned copy before provider awaits. CODE host source bytes remain
 * outside scope; nominal data getters/aliases cannot retarget an observation.
 */
export function snapshotLocalHostSource(raw){
 keys(raw,['sourceSha','sourceTree','files']);
 const identity=fields(jsonData({sourceSha:own(raw,'sourceSha'),sourceTree:own(raw,'sourceTree')}),['sourceSha','sourceTree']);
 if(!Object.values(identity).every(value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)))throw new Error('proposal-local-source-unavailable');
 const input=own(raw,'files');keys(input,['workflow','entry','profile']);
 const files=Object.create(null);
 for(const kind of ['workflow','entry','profile']){
  const bytes=own(input,kind);
  if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>512*1024)throw new Error('proposal-local-source-unavailable');
  files[kind]=Buffer.from(bytes);
 }
 return Object.freeze({...identity,files:Object.freeze(files)});
}
