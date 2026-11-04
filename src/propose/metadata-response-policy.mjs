const uncertainHttp=new Set([408,500,502,503,504]);
const networkCodes=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH',
 'UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
function data(value,key){
 if(value===null||typeof value!=='object')return undefined;
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;
}
/** Narrow endpoint-response classification, never effect/domain eligibility.
 * "returned" means bounded HTTP200 bytes only, not parsed/exact/reconciled.
 * Other 5xx/redirect/unexpected responses require technical failure.
 */
export function metadataHttpOutcome(status){
 if(status===200)return 'returned';
 if(uncertainHttp.has(status))return 'uncertain';
 if(Number.isInteger(status)&&status>=400&&status<500)return 'rejected';
 return 'failed';
}
/** Called only around the actual admitted fetch after its request is charged.
 * Known native network shape or the actual aborted signal reason may be
 * uncertain. An arbitrary caught exception is a technical failure. Error
 * messages, causes, scope and provider bodies never become public facts.
 */
export function metadataFetchFailure(error,signal,budgetExhausted){
 if(budgetExhausted)return 'failed';
 if(signal.aborted&&error===signal.reason&&error instanceof DOMException&&
  ['AbortError','TimeoutError'].includes(error.name))return 'uncertain';
 if(error instanceof TypeError&&data(error,'message')==='fetch failed'&&
  networkCodes.has(data(data(error,'cause'),'code')))return 'uncertain';
 return 'failed';
}
