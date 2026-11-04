import {foottraceProposalEffectPort} from './foottrace-transport.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('nonforce-ref-submission-unavailable');};
/** One SAME-owner closed force:false submission. This only classifies the
 * actual transport response; it never admits source, history, writer or an
 * effect. The owning native flow must commit/recheck its exact pre-effect.
 * Every uncertain/non-returned response stops later mutations on this owner.
 */
export function createFoottraceRefSubmission({transport,head}){
 const port=foottraceProposalEffectPort(transport,{effect:'move-ref',payload:{sha:head,force:false}});
 let used=false,attempted=false,moved=false,outcome='not-attempted';
 return Object.freeze({
  submit:async()=>{
   if(used)fail();used=true;attempted=true;moved=null;let reply;
   try{reply=await port.submit();}
   catch{outcome=port.observation().state;if(outcome!=='uncertain')fail();return;}
   outcome=port.observation().state;
   if(outcome!=='returned')fail();
   const actual=own(own(reply,'data'),'object');
   if(own(actual,'type')!=='commit'||own(actual,'sha')!==head)fail();
   outcome='acknowledged';moved=true;
  },
  observation:()=>Object.freeze({outcome,attempted,moved,authorized:false})
 });
}
