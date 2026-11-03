import {containsRecordText} from './record-text-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
import {runFoottraceMetadataInputInspection} from '../../src/propose/foottrace-metadata-inputs.mjs';
import {createFoottraceComputedMetadataReader} from '../../src/propose/computed-proposal-metadata.mjs';
async function setup(options={}){
 const f=await metadataInputFixture(options),input=await runFoottraceMetadataInputInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 assert.equal(input.status,'metadata-inputs-only');
 return {f,backend:input.backend,read:createFoottraceComputedMetadataReader({transport:f.transport,context:f.fullContext})};
}
for(const metadata of ['exact','stale'])test('real current source and PR observations report '+metadata+' computed metadata without authority',async()=>{
 const {f,backend:b,read}=await setup({metadata}),r=await read(b.prepared,b.pending);
 assert.equal(r.valid,true);assert.equal(r.observation.matches,metadata==='exact');
 assert.equal(r.payload.title,'Release '+b.prepared.version);assert.ok(r.payload.body.includes(b.prepared.prepared.notes));
 assert.equal(r.authorized,false);assert.equal(r.writerCredentialBindingAdmitted,false);
 assert.equal(JSON.stringify(r.observation).includes(PRIVATE),false);
 assert.equal(containsRecordText(r.observation,r.payload.body),false);
 assert.equal(f.calls.every(x=>typeof x==='string'),true);
});
for(const [label,change] of [
 ['source',p=>({...p,sourceSha:'f'.repeat(40)})],
 ['tree',p=>({...p,targetTree:'f'.repeat(40)})],
 ['scope',p=>({...p,scope:'saved-metadata'})]
])test('different '+label+' cannot borrow current native metadata observation',async()=>{
 const {f,backend:b,read}=await setup(),count=f.calls.length,r=await read(change(b.prepared),b.pending);
 assert.equal(r.valid,false);assert.equal(f.calls.length,count);
});
test('different pending source cannot borrow current native metadata observation',async()=>{
 const {f,backend:b,read}=await setup(),count=f.calls.length;
 const r=await read(b.prepared,{...b.pending,reference:{...b.pending.reference,source:'f'.repeat(40)}});
 assert.equal(r.valid,false);assert.equal(f.calls.length,count);
});
test('actual PR metadata changing among the four snapshots stays unknown',async()=>{
 const {backend:b,read}=await setup({changeMetadata:(d,n)=>{if(n%4>=2)d.body+='Changed';}});
 const r=await read(b.prepared,b.pending);assert.equal(r.valid,false);
 assert.equal(r.reason,'computed-metadata-unavailable');
});
