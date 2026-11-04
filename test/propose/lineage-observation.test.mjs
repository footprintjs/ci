import test from 'node:test';
import assert from 'node:assert/strict';
import native from '../../src/guards/release-github.cjs';
import {createFoottraceLineageReader,createFoottraceLineageObservationReader} from '../../src/propose/foottrace-lineage.mjs';
import {managedReleaseFixture} from '../upstream/test/release/helpers.mjs';
export async function lineageFixture() {
 const f=managedReleaseFixture({published:true}),context={repository:f.repository,sha:f.context.sha},source=await native.sourceInput(f.api,context);
 const expected={sourceSha:context.sha,sourceTree:source.commit.tree.sha,fromVersion:source.pkg.version,
  predecessor:{pr:f.originalPR.number,head:f.originalHead,tree:f.commits.get(f.originalHead).tree.sha,merge:f.originalMerge}};
 return {f,context,expected,transport:{api:f.api,registry:()=>f.fetcher},settings:f.options.settings};
}
test('published L is discovered by the pinned native guard before any caller-supplied predecessor exists',async()=>{
 const f=await lineageFixture(),r=await createFoottraceLineageObservationReader(f)();assert.equal(r.valid,true);assert.equal(r.scope,'published-lineage-only');
 assert.deepEqual(JSON.parse(JSON.stringify(r.predecessor)),f.expected.predecessor);assert.equal(r.sourceSha,f.context.sha);assert.equal(r.sourceTree,f.expected.sourceTree);
 assert.equal(r.authorized,false);assert.equal(r.privateAppIdentityAdmitted,false);assert.equal(r.provenanceCryptographicallyVerified,false);
});
test('a caller-selected same-tree cloned head cannot replace the actual PR head admitted inside native publicationState',async()=>{
 const f=await lineageFixture(),clone='f'.repeat(40);f.f.commits.set(clone,{...structuredClone(f.f.commits.get(f.f.originalHead)),sha:clone});f.expected.predecessor.head=clone;
 const original=f.transport.api;let reads=0;f.transport.api=async(m,p,b)=>{const reply=await original(m,p,b);if(p.includes('/commits/'+f.f.originalMerge+'/pulls')&&++reads>1)
 return {data:reply.data.map(row=>({...row,head:{...row.head,sha:clone}}))};return reply;};
 const r=await createFoottraceLineageReader(f)(f.expected);assert.equal(r.valid,false);assert.equal(reads,2);
});
test('a substituted linked PR number after native admission cannot become a discovered predecessor',async()=>{
 const f=await lineageFixture(),original=f.transport.api;let reads=0;f.transport.api=async(m,p,b)=>{const r=await original(m,p,b);if(p.includes('/commits/'+f.f.originalMerge+'/pulls')&&++reads>1)
 return {data:r.data.map(row=>({...row,number:999}))};return r;};assert.equal((await createFoottraceLineageObservationReader(f)()).valid,false);
});
test('missing registry publication is an unavailable lineage, never inferred from tag/source equality',async()=>{
 const f=await lineageFixture();f.f.registry.clear();const r=await createFoottraceLineageObservationReader(f)();assert.equal(r.valid,false);assert.equal(r.authorized,false);
});
test('private provider failures retain a finite lineage hold before native or saved evidence can escape',async()=>{
 const f=await lineageFixture();f.transport.api=async()=>{throw new Error('PRIVATE-LINEAGE-BOOTSTRAP');};
 const r=await createFoottraceLineageObservationReader(f)();assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes('PRIVATE-LINEAGE-BOOTSTRAP'),false);
});
