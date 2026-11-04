import {isMetadataHoldSignal} from './metadata-hold-signals.mjs';
import {createProposalOutcomeOutput} from './proposal-outcome-output.mjs';
const attempted=new WeakSet();
const fail=()=>{throw new Error('metadata-hold-output-unavailable');};
/** Negative diagnostic wrapper over ONE fixed output core. Only its runtime
 * signal may be reported; neither ownership nor persistence admits a terminal.
 */
export function createMetadataHoldOutput(ports){
 let writer;try{writer=createProposalOutcomeOutput(ports);}catch{fail();}
 return Object.freeze({write:async signal=>{
  try{
   if(!isMetadataHoldSignal(signal)||attempted.has(signal))fail();
   attempted.add(signal);
   return await writer.write('metadata-hold');
  }catch{fail();}
 }});
}
