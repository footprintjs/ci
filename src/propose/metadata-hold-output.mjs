import {own,keys} from './source-inventory.mjs';
import {isMetadataHoldSignal} from './metadata-hold-signals.mjs';
const attempted=new WeakSet();
const fail=()=>{throw new Error('metadata-hold-output-unavailable');};
/** Diagnostic-only IO. One attempt, summary before named output; no append retry
 * after partial/uncertain save. This cannot admit technical job completion.
 * CODE ports own paths and the caller still owes actual terminal admission.
 */
export function createMetadataHoldOutput(ports){
 keys(ports,['appendSummary','appendOutput']);
 const summary=own(ports,'appendSummary'),output=own(ports,'appendOutput');
 if(typeof summary!=='function'||typeof output!=='function')fail();
 let used=false;
 return Object.freeze({write:async signal=>{
  try{
   if(used||!isMetadataHoldSignal(signal)||attempted.has(signal))fail();
   used=true;attempted.add(signal);
   await summary(signal.summary);
   await output(signal.output);
   return Object.freeze({diagnosticSaved:true,terminalAdmission:false,releaseReady:false,authorized:false});
  }catch{fail();}
 }});
}
