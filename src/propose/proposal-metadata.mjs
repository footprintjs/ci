import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fields,jsonData} from '../eco/json-data.mjs';
import {own} from './source-inventory.mjs';
import {createFoottracePendingObservationReader,bindFoottracePendingReference} from './foottrace-pending.mjs';
const fail=()=>{throw new Error('pending-metadata-unavailable');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function metadata(raw,desired=false) {
 const value=desired?fields(jsonData(raw,128*1024),['title','body']):
  jsonData({title:own(raw,'title'),body:own(raw,'body')===null?'':own(raw,'body')},128*1024);
 for(const [key,limit] of [['title',256],['body',65536]]){
  const text=value[key];
  if(typeof text!=='string'||Buffer.byteLength(text)>limit||
   Buffer.from(text).toString('utf8')!==text||(key==='title'&&!text.length))fail();
 }
 return value;
}
/** Actual native PR title/body snapshot against a trusted computed payload.
 * Whole source/preparation, current identity, eligibility, writer binding and
 * effect capture are independent. Only exact owned digests/match facts return;
 * no provider body, desired body, private error or saved permission is exposed.
 */
export function createFoottraceProposalMetadataReader({api,context,settings}) {
 context=jsonData(context);settings=jsonData(settings);
 createFoottracePendingObservationReader({api,context,settings});
 return async(reference,desired)=>{
  const observations=[];
  try{
   const expected=bindFoottracePendingReference(reference,context.sha),payload=metadata(desired,true);
   const captured=[],detail='/repos/footprintjs/foottrace/pulls/'+expected.pr;
   const read=async(method,route,body)=>{
    if(method!=='GET'||body!==undefined||observations.length>=64)fail();
    const boundary={kind:'native-pending-metadata',method:'GET',status:'unavailable'};observations.push(boundary);
    const reply=await api(method,route);
    if(route===detail){
     const value=metadata(own(reply,'data'));captured.push(value);
     boundary.projectionDigest=digest(value);boundary.status='projected';
    }else boundary.status='returned';
    return reply;
   };
   const pending=createFoottracePendingObservationReader({api:read,context,settings});
   const before=await pending();
   if(!before.valid||!isDeepStrictEqual(before.reference,expected))fail();
   const after=await pending();
   if(!after.valid||!isDeepStrictEqual(after.reference,expected)||captured.length!==4||
    captured.some(value=>!isDeepStrictEqual(value,captured[0])))fail();
   return Object.freeze({valid:true,scope:'pending-metadata-observation-only',reference:expected,
    matches:isDeepStrictEqual(payload,captured[0]),desiredDigest:digest(payload),observedDigest:digest(captured[0]),
    metadataObservations:captured.length,adjacentSnapshotOnly:true,writerCredentialBindingAdmitted:false,
    retainedEligibilityAdmitted:false,authorized:false,executedWrites:0,
    observations:Object.freeze(observations.map(Object.freeze))});
  }catch{return Object.freeze({valid:false,reason:'pending-metadata-unavailable',authorized:false,
   writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,executedWrites:0,
   observations:Object.freeze(observations.map(Object.freeze))});}
 };
}
