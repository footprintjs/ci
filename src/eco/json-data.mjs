/** Strict data boundary shared by finite ledger and observation schemas. */
export function invalid() { const error = new Error('ledger-invalid'); error.code = 'ledger-invalid'; throw error; }
export function jsonData(input) {
  let nodes=0; const stack=new Set();
  const visit=(value,depth)=>{
    if (++nodes>50000 || depth>12) invalid();
    if (value===null || typeof value==='boolean') return value;
    if (typeof value==='string') { if(Buffer.byteLength(value)>1024*1024) invalid(); return value; }
    if (typeof value==='number') {if(!Number.isSafeInteger(value))invalid();return value;}
    if (!value || typeof value!=='object' || stack.has(value)) invalid();
    const proto=Object.getPrototypeOf(value), descriptors=Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if(proto!==Array.prototype || value.length>4096 || Reflect.ownKeys(descriptors).length!==value.length+1) invalid();
      stack.add(value);const result=[];
      for(let i=0;i<value.length;i++){const d=descriptors[i];if(!d || !Object.hasOwn(d,'value'))invalid();result.push(visit(d.value,depth+1));}
      stack.delete(value);return Object.freeze(result);
    }
    if(proto!==Object.prototype && proto!==null)invalid();
    if(Reflect.ownKeys(descriptors).length>256)invalid();stack.add(value);const result=Object.create(null);
    for(const key of Reflect.ownKeys(descriptors)){
      const d=descriptors[key];if(typeof key!=='string'||!Object.hasOwn(d,'value')||['__proto__','constructor','prototype'].includes(key))invalid();
      result[key]=visit(d.value,depth+1);
    }
    stack.delete(value);return Object.freeze(result);
  };
  try {const result=visit(input,0);if(Buffer.byteLength(JSON.stringify(result))>1024*1024)invalid();return result;}
  catch{invalid();}
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
