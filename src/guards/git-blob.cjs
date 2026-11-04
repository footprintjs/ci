'use strict';
const preparation=require('./release-prepare.cjs');
const control=require('./release-control.cjs');
const owners=new WeakMap(),bindings=new WeakMap();
const DEFAULTS=Object.freeze({maxEntries:4096,maxBytes:128*1024*1024,maxPending:64});
const fail=()=>{const e=new Error('source-content');e.code='source-content';throw e;};
function createGitBlobOwner(repository,limits={}){
 if(!repository||!Number.isSafeInteger(repository.id)||repository.id<1||typeof repository.full_name!=='string'||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.full_name)||
  !limits||typeof limits!=='object'||Object.keys(limits).some(k=>!Object.hasOwn(DEFAULTS,k)))fail();
 const bound={...DEFAULTS,...limits};
 for(const key of Object.keys(DEFAULTS))if(!Number.isSafeInteger(bound[key])||bound[key]<1||bound[key]>DEFAULTS[key])fail();
 const owner=Object.freeze({});
 owners.set(owner,{repository:{id:repository.id,full_name:repository.full_name},limits:bound,blobs:new Map(),pending:new Map(),bytes:0,full:false});
 return owner;
}
function bindGitBlobOwner(api,owner){
 if(typeof api!=='function'||!owners.has(owner)||(bindings.has(api)&&bindings.get(api)!==owner))fail();
 bindings.set(api,owner);return api;
}
// Fixed trusted CODE read-facet aliases keep the ONE native blob port's owner.
// No store value/parameter enters sourceView/sourceInput or model DATA.
function inheritGitBlobRead(target,source){
 if(typeof target!=='function'||typeof source!=='function')fail();
 if(bindings.has(source))bindGitBlobOwner(target,bindings.get(source));
 return target;
}
function gitBlobOwnerFacts(owner){
 const s=owners.get(owner);if(!s)fail();
 return Object.freeze({entries:s.blobs.size,bytes:s.bytes,pending:s.pending.size,full:s.full,authorized:false});
}
// The SAME native decoder, extracted once. Failed/unknown/malformed responses
// propagate directly; they never enter the owner store or trigger a fallback.
async function decodeGitBlob(api,context,id){
 const value=(await api('GET','/repos/'+context.repository.full_name+'/git/blobs/'+id)).data;
 if(value.sha!==id||value.encoding!=='base64'||typeof value.content!=='string'||
  !Number.isSafeInteger(value.size)||value.size<0||value.size>2*1024*1024||
  !/^[A-Za-z0-9+/=\r\n]*$/.test(value.content)||value.content.length>3*1024*1024)fail();
 const bytes=Buffer.from(value.content,'base64');
 if(bytes.length!==value.size||preparation.gitObject('blob',bytes)!==id)fail();
 return bytes;
}
async function readGitBlob(api,context,id){
 if(!control.validSha(id))fail();
 const owner=bindings.get(api),s=owner===undefined?null:owners.get(owner);
 if(s===null)return decodeGitBlob(api,context,id);
 if(context.repository.id!==s.repository.id||context.repository.full_name!==s.repository.full_name)fail();
 const key=s.repository.id+':'+id;
 if(s.blobs.has(key))return Buffer.from(s.blobs.get(key));
 if(s.pending.has(key))return Buffer.from(await s.pending.get(key));
 const load=async()=>{
  const bytes=await decodeGitBlob(api,context,id);
  if(!s.full&&!s.blobs.has(key)){
   if(s.blobs.size>=s.limits.maxEntries||s.bytes+bytes.length>s.limits.maxBytes)s.full=true;
   else{
    s.blobs.set(key,Buffer.from(bytes));s.bytes+=bytes.length;
    if(s.blobs.size===s.limits.maxEntries||s.bytes===s.limits.maxBytes)s.full=true;
   }
  }
  return bytes;
 };
 // Full resident or in-flight store never creates a new budget failure. The
 // normal verified GET still consumes the SAME cumulative transport budget.
 if(s.full||s.pending.size>=s.limits.maxPending)return Buffer.from(await load());
 const work=load();s.pending.set(key,work);
 try{return Buffer.from(await work);}finally{s.pending.delete(key);}
}
module.exports={createGitBlobOwner,bindGitBlobOwner,inheritGitBlobRead,gitBlobOwnerFacts,readGitBlob};
