/** Strict data boundary shared by finite ledger and observation schemas. */
export function invalid() { const error = new Error('ledger-invalid'); error.code = 'ledger-invalid'; throw error; }
/** Count the serialized UTF8 bytes before retaining each piece of owned data.
 * The pinned Foottrace public APIs do not expose their internal JSON budget.
 * Limits cover repeated values, keys, punctuation and JSON escaping; no stringify
 * of an unadmitted tree. This is a data boundary, not a hostile-Proxy sandbox.
 * A caller may lower, never raise, the fixed one-MiB ceiling.
 */
export function jsonData(input,maxBytes=1024*1024) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024)invalid();
  let nodes=0,remaining=maxBytes;const stack=new Set();
  const spend=bytes=>{if(bytes>remaining)invalid();remaining-=bytes;};
  const string=value=>{
    spend(2);
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);
      if(c===34||c===92||[8,9,10,12,13].includes(c))spend(2);
      else if(c<32)spend(6);
      else if(c<128)spend(1);
      else if(c<2048)spend(2);
      else if(c>=0xd800&&c<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){spend(4);i++;}
      else if(c>=0xd800&&c<=0xdfff)spend(6);
      else spend(3);
    }
  };
  const visit=(value,depth)=>{
    if (++nodes>50000 || depth>12) invalid();
    if(value===null){spend(4);return value;}
    if(typeof value==='boolean'){spend(value?4:5);return value;}
    if(typeof value==='string'){string(value);return value;}
    if(typeof value==='number'){if(!Number.isSafeInteger(value))invalid();spend(String(value).length);return value;}
    if(!value||typeof value!=='object'||stack.has(value))invalid();
    const proto=Object.getPrototypeOf(value);
    if(Array.isArray(value)){
      const length=Object.getOwnPropertyDescriptor(value,'length')?.value;
      if(proto!==Array.prototype||!Number.isSafeInteger(length)||length>4096)invalid();
      spend(2+Math.max(0,length-1));
      if(Reflect.ownKeys(value).length!==length+1)invalid();
      stack.add(value);const result=[];
      for(let i=0;i<length;i++){
        const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!Object.hasOwn(d,'value'))invalid();
        result.push(visit(d.value,depth+1));
      }
      stack.delete(value);return Object.freeze(result);
    }
    if(proto!==Object.prototype&&proto!==null)invalid();
    const keys=Reflect.ownKeys(value);if(keys.length>256)invalid();
    spend(2+Math.max(0,keys.length-1)+keys.length);
    stack.add(value);const result=Object.create(null);
    for(const key of keys){
      if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))invalid();
      string(key);const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))invalid();
      result[key]=visit(d.value,depth+1);
    }
    stack.delete(value);return Object.freeze(result);
  };
  try{return visit(input,0);}catch{invalid();}
}
export function fields(value,names) {
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();const keys=Object.keys(value);
  if(keys.length!==names.length||keys.some(k=>!names.includes(k)))invalid();return value;
}
export function text(value,pattern,max=200) {if(typeof value!=='string'||Buffer.byteLength(value)>max||!pattern.test(value))invalid();return value;}
export function id(value) {if(!Number.isSafeInteger(value)||value<1)invalid();return value;}
export function array(value,max=128) {if(!Array.isArray(value)||value.length>max)invalid();return value;}
export function unique(items,key=value=>value) {if(new Set(items.map(key)).size!==items.length)invalid();return items;}
/** Canonical compact or two-space JSON refuses duplicate keys before admission. */
export function parseLedgerText(source) {
  if(typeof source!=='string'||Buffer.byteLength(source)>1024*1024)invalid();
  try {const result=jsonData(JSON.parse(source));const trimmed=source.trim();if(trimmed!==JSON.stringify(result)&&trimmed!==JSON.stringify(result,null,2))invalid();return result;}catch{invalid();}
}
