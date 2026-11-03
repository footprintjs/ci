import test from 'node:test';
import assert from 'node:assert/strict';
import { createCandidatePublicationReader } from '../../src/propose/candidate-publication.mjs';
import { fixture, PRIVATE } from './candidate-provider-fixture.mjs';
const read=async f=>createCandidatePublicationReader(f)(f.input);
test('complete adjacent conflict observations cover pending and newly prepared versions, excluding published L',async()=>{
 const f=fixture(),r=await read(f);assert.equal(r.valid,true);assert.deepEqual([...r.versions],['1.1.1','1.2.0']);
 assert.equal(r.scope,'candidate-publication-conflicts-only');assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.authorized,false);
 assert.equal(r.providerContinuityProved,false);assert.equal(r.erasedHistoryProved,false);assert.equal(r.registryAbsenceOnlyAtRead,true);
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.ok(f.calls.every(c=>c.method==='GET'&&c.body===undefined));
 assert.equal(f.calls.filter(c=>c.registryVersion).length,4);
});
test('all bounded witness versions survive repeated refresh, even when the newest target differs',async()=>{
 const f=fixture();f.input.preparationRefs.push({version:'1.1.2'},{version:'1.2.0'});const r=await read(f);
 assert.equal(r.valid,true);assert.deepEqual([...r.versions],['1.1.1','1.1.2','1.2.0']);
});
test('a reservation marker on an unrelated release still holds the candidate',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/assets?'))d[0].name='publish-attempt-1.1.1.json';}}));
 assert.equal(r.valid,false);assert.equal(r.reason,'candidate-reservation-or-publication');assert.ok(r.conflicts.some(x=>x.kind==='marker'));
});
test('a starter or empty candidate marker is uncertainty, never absence',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/assets?'))Object.assign(d[0],{name:'publish-attempt-1.2.0.json',state:'starter',size:0});}}));
 assert.equal(r.valid,false);assert.equal(r.reason,'candidate-reservation-or-publication');
});
test('a candidate release without a journal holds',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/releases?'))d[0].tag_name='v1.2.0';}}));assert.equal(r.valid,false);assert.equal(r.reason,'candidate-reservation-or-publication');
});
test('a bare-version candidate release also holds',async()=>{
 const r=await read(fixture({change:(d,p)=>{if(p.includes('/releases?'))d[0].tag_name='1.1.1';}}));assert.equal(r.valid,false);
});
test('actual registry presence holds even when tag/release are absent',async()=>{
 const r=await read(fixture({registry:version=>({version,integrity:'sha512-'+'A'.repeat(86)+'==',private:PRIVATE})}));
 assert.equal(r.valid,false);assert.equal(r.reason,'candidate-reservation-or-publication');assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('a candidate tag is a conflict regardless of its target',async()=>{
 const f=fixture(),base=f.api;f.api=async(m,p,b)=>p.includes('/git/ref/tags/v1.2.0')?{data:{ref:'refs/tags/v1.2.0',object:{type:'tag',sha:'a'.repeat(40)}}}:base(m,p,b);
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.conflicts.some(x=>x.kind==='tag'));
});
for(const [name,change] of [
 ['duplicate release identities',(d,p)=>{if(p.includes('/releases?'))d.push({...d[0]});}],
 ['duplicate asset identities',(d,p)=>{if(p.includes('/assets?'))d.push({...d[0]});}],
 ['changed adjacent release',(d,p,n)=>{if(p.includes('/releases?')&&n.phase===2)d[0].draft=true;}],
 ['changed adjacent asset',(d,p,n)=>{if(p.includes('/assets?')&&n.phase===2)d[0].size++;}],
 ['missing asset list',(d,p)=>{if(p.includes('/assets?'))d.length=100;}],
 ['unknown asset state',(d,p)=>{if(p.includes('/assets?'))d[0].state={private:PRIVATE};}],
 ['malformed release tag',(d,p)=>{if(p.includes('/releases?'))d[0].tag_name={private:PRIVATE};}],
])test(name+' holds without raw private text',async()=>{
 const r=await read(fixture({change}));assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('an unavailable tag read cannot become an absence or history pass',async()=>{
 const f=fixture(),base=f.api;f.api=(m,p,b)=>{if(p.includes('/tags/')){const e=new Error(PRIVATE);e.status=403;throw e;}return base(m,p,b);};
 const r=await read(f);assert.equal(r.valid,false);assert.equal(r.reason,'candidate-publication-unavailable');assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('an unverified registry boolean is never an absence witness',async()=>{
 const r=await read(fixture({registry:()=>false}));assert.equal(r.valid,false);assert.equal(r.reason,'candidate-publication-unavailable');
});
test('changed registry presence remains a conflict, never retryable permission',async()=>{
 const r=await read(fixture({registry:(version,phase)=>phase===1?null:{version,integrity:'sha512-'+'A'.repeat(86)+'=='}}));assert.equal(r.valid,false);assert.equal(r.authorized,false);
});
test('a missing pending version does not silently shrink the candidate set',async()=>{
 const f=fixture();delete f.input.preparationRefs[0].version;const r=await read(f);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('a predecessor version cannot be admitted as an unpublished candidate',async()=>{
 const f=fixture();f.input.preparationRefs[0].version=f.input.fromVersion;const r=await read(f);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('more than eight pending witnesses holds before transport',async()=>{
 const f=fixture();f.input.preparationRefs=Array.from({length:9},()=>({version:'1.1.1'}));const r=await read(f);assert.equal(r.valid,false);assert.equal(f.calls.length,0);
});
test('private unowned bodies do not affect owned evidence digests',async()=>{
 const a=await read(fixture()),b=await read(fixture({change:d=>{d.private='other private';}}));assert.equal(a.valid,true);assert.equal(b.valid,true);assert.equal(a.digest,b.digest);
});

test('an observed candidate marker remains explicit when a later read is unavailable',async()=>{
 const f=fixture({change:(d,p)=>{if(p.includes('/assets?'))d[0].name='publish-attempt-1.2.0.json';}}),base=f.api;
 f.api=(m,p,b)=>{if(p.includes('/tags/')){const error=new Error(PRIVATE);error.status=403;throw error;}return base(m,p,b);};
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.conflicts?.some(x=>x.kind==='marker'));
});
test('a conflict seen in the first collection cannot disappear from failed evidence after drift',async()=>{
 const f=fixture({change:(d,p,n)=>{if(p.includes('/assets?')&&n.phase===1)d[0].name='publish-attempt-1.2.0.json';}});
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.conflicts?.some(x=>x.kind==='marker'));
});

test('native marker and tag naming laws are explicit reviewed profile data',async()=>{
 const f=fixture({change:(d,p)=>{if(p.includes('/assets?'))d[0].name='retained-reservation-1.2.0.json';}});
 f.nativeProfile={markerPrefix:'retained-reservation-',tagPrefixes:['v']};
 const r=await read(f);assert.equal(r.valid,false);assert.ok(r.conflicts.some(x=>x.kind==='marker'));
});
test('missing native naming profile never falls back to guessed release laws',()=>{
 const f=fixture();delete f.nativeProfile;assert.throws(()=>createCandidatePublicationReader(f));
});
test('a returned malformed tag body cannot impersonate an HTTP404 absence',async()=>{
 const f=fixture(),base=f.api;f.api=(m,p,b)=>p.includes('/tags/')?Promise.resolve({data:{status:404,private:PRIVATE}}):base(m,p,b);
 return read(f).then(r=>{assert.equal(r.valid,false);assert.equal(r.reason,'candidate-publication-unavailable');});
});
