import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('pending-metadata-unavailable');};
/** Exact bounded title/body DATA. This binds bytes, never eligibility or permission. */
export function bindProposalMetadata(raw,desired=false) {
 const value=desired?fields(jsonData(raw,128*1024),['title','body']):
  jsonData({title:own(raw,'title'),body:own(raw,'body')===null?'':own(raw,'body')},128*1024);
 for(const [key,limit] of [['title',256],['body',65536]]){
  const text=value[key];
  if(typeof text!=='string'||Buffer.byteLength(text)>limit||
   Buffer.from(text).toString('utf8')!==text||(key==='title'&&!text.length))fail();
 }
 return value;
}
