import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import native from '../../src/guards/release-github.cjs';
import metadataPolicy from '../../src/guards/proposal-metadata.cjs';
const original=JSON.parse(readFileSync(new URL('./fixtures/native-proposal-metadata.json',import.meta.url)));
const compute=await import('../../src/propose/computed-proposal-metadata.mjs').catch(()=>({}));
const prepared=()=>({version:original.version,prepared:{version:original.version,notes:original.notes}});
test('one native metadata factory preserves the old actual writer title/body bytes',()=>{
 assert.equal(typeof metadataPolicy.proposalMetadata,'function');
 assert.equal(Object.hasOwn(native,'proposalMetadata'),false,'No forwarding formatter alias remains on the native guard API');
 const value=metadataPolicy.proposalMetadata(original.version,original.notes);
 assert.deepEqual(value,{title:original.requestBody.title,body:original.requestBody.body});
});
test('computed payload uses current prepared version/notes and the same native policy',()=>{
 assert.equal(typeof compute.computeFoottraceProposalMetadata,'function');
 const value=compute.computeFoottraceProposalMetadata(prepared());
 assert.equal(value.title,original.requestBody.title);assert.equal(value.body,original.requestBody.body);
 assert.equal(Object.isFrozen(value),true);
});
for(const change of [
 p=>{p.version='2.0.0';},p=>{p.prepared.version='2.0.0';},p=>{p.version=7;},
 p=>{p.prepared.notes=null;},p=>{p.prepared.notes='x'.repeat(65537);},
 p=>{p.prepared.notes='\ud800';}
])test('unbound or over-budget current preparation cannot become a desired payload',()=>{
 assert.equal(typeof compute.computeFoottraceProposalMetadata,'function');const p=prepared();change(p);
 assert.throws(()=>compute.computeFoottraceProposalMetadata(p));
});
test('DATA accessors do not run while computing bounded metadata',()=>{
 assert.equal(typeof compute.computeFoottraceProposalMetadata,'function');let reads=0,p=prepared();
 Object.defineProperty(p.prepared,'notes',{enumerable:true,get(){reads++;return 'PRIVATE';}});
 assert.throws(()=>compute.computeFoottraceProposalMetadata(p));assert.equal(reads,0);
});

import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
test('actual existing native proposal route emits the original request payload after extraction',async()=>{
 const f=managedReleaseFixture({published:true}),plan=await native.plan(f.api,f.context,f.options);
 const payload=await native.prepareProposal(f.api,f.context,plan,f.options);
 await native.writeProposal(f.api,f.context,payload,plan,f.options);
 const created=f.calls.find(c=>c.method==='POST'&&c.route.endsWith('/pulls'));
 assert.equal(JSON.stringify(created.body),JSON.stringify(original.requestBody));
});
test('oversize or broken-Unicode notes are rejected before the native formatter allocates their rendered payload',()=>{
 const actual=metadataPolicy.proposalMetadata;let calls=0;metadataPolicy.proposalMetadata=(...args)=>{calls++;return actual(...args);};
 try{
  for(const notes of ['x'.repeat(65537),'é'.repeat(32769),'\ud800']){
   const p=prepared();p.prepared.notes=notes;assert.throws(()=>compute.computeFoottraceProposalMetadata(p));
  }
  assert.equal(calls,0);
 }finally{metadataPolicy.proposalMetadata=actual;}
});
