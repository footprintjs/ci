import test from 'node:test';import assert from 'node:assert/strict';
import {jsonData} from '../../src/eco/json-data.mjs';
const refuse=fn=>assert.throws(fn,{code:'ledger-invalid'});
test('B1: repeated values and keys are charged before detaching or serializing the whole tree',()=>{
 const value='a'.repeat(40);refuse(()=>jsonData(Array(12).fill(value),128));
 const keyed=Object.fromEntries(Array.from({length:12},(_,i)=>['key'+i,value]));refuse(()=>jsonData(keyed,128));
});
test('JSON admission measures UTF8, escapes, punctuation and every repeated occurrence exactly',()=>{
 for(const value of [null,true,false,0,-123,[],{},['é','😀','\ud800','\udc00','\\','"','\n','\u0000'],{'é\n':['😀','é','é'],abc:true},Array(8).fill('repeated')]){
  const bytes=Buffer.byteLength(JSON.stringify(value));assert.deepEqual(JSON.parse(JSON.stringify(jsonData(value,bytes))),value);
  if(bytes>1)refuse(()=>jsonData(value,bytes-1));
 }
});
test('budget refusal happens before visiting later values; hooks and sparse data stay refused',()=>{
 let called=0;const input=['a'.repeat(100)];Object.defineProperty(input,1,{enumerable:true,get(){called++;throw Error('private')}});
 refuse(()=>jsonData(input,32));assert.equal(called,0);
 for(const budget of [0,-1,Infinity,2**30,{},NaN])refuse(()=>jsonData({},budget));
 const cyclic=[];cyclic.push(cyclic);refuse(()=>jsonData(cyclic));refuse(()=>jsonData(Array(3)));
 const hooked={toJSON(){called++;return {}}};refuse(()=>jsonData(hooked));assert.equal(called,0);
});

test('B1: exhausted cumulative budget stops descriptor work before later array values',()=>{
 let visits=0;const repeated=Array(12).fill('x'.repeat(40));
 // Cooperative instrumentation of descriptor work, not a hostile-Proxy claim.
 const observed=new Proxy(repeated,{getOwnPropertyDescriptor(target,key){if(key!=='length')visits++;return Reflect.getOwnPropertyDescriptor(target,key);}});
 refuse(()=>jsonData(observed,128));assert(visits<=3);
});
test('default one-MiB ceiling also refuses repeated strings without serializing an unadmitted tree',()=>{
 const value=Array(128).fill('x'.repeat(9000));
 const original=JSON.stringify;let calls=0;
 try{JSON.stringify=(...args)=>{calls++;return original(...args);};refuse(()=>jsonData(value));assert.equal(calls,0);}finally{JSON.stringify=original;}
});
