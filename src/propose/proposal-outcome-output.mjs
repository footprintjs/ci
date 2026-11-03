import {own,keys} from './source-inventory.mjs';
import {proposalOutcomeText} from './proposal-outcome-text.mjs';
const fail=()=>{throw new Error('proposal-output-unavailable');};
/** Fixed local diagnostic IO only. The actual owning native controller must
 * prove its terminal before calling this port. Enum text/IO success supplies
 * no native terminal, writer, business-job success or release authority.
 */
export function createProposalOutcomeOutput(ports){
 keys(ports,['appendSummary','appendOutput']);
 const summary=own(ports,'appendSummary'),output=own(ports,'appendOutput');
 if(typeof summary!=='function'||typeof output!=='function')fail();
 let used=false;
 return Object.freeze({write:async outcome=>{
  try{
   const text=proposalOutcomeText(outcome);if(used)fail();used=true;
   await summary(text.summary);
   await output(text.output);
   return Object.freeze({diagnosticSaved:true,terminalAdmission:false,releaseReady:false,authorized:false});
  }catch{fail();}
 }});
}
