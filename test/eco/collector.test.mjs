import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';import {createHash} from 'node:crypto';
import {createEcoReader} from '../../src/eco/github-reader.mjs';import {observedVerdictFinding} from '../../src/eco/verdict-history.mjs';
const file=new URL('../../src/eco/collector.mjs',import.meta.url);const mod=existsSync(file)?await import(file):{};
import {fixture,head,base,tree,prior,target,anchor,rawPull} from './fixtures/github.mjs';
const collect=async f=>{assert.equal(typeof mod.collectSnapshot,'function','eco collector feature required');return mod.collectSnapshot({reader:f.reader,target});};
test('current provider pages stay explicitly history-incomplete even with a matching merge comment',async()=>{
 const f=fixture();const s=await collect(f);assert.equal(s.facts.stable,true);assert.equal(s.facts.historyComplete,false);assert.equal(s.facts.commentCount,1);assert.equal(s.receipt.state.push,null);
 assert.equal(observedVerdictFinding(s.receipt.state,{repositoryId:1,pullNumber:2,ownerId:7,head,base,tree,action:'merge-source'}).code,'verdict-missing');
 assert.doesNotMatch(JSON.stringify(s),/secret body|\/Users|created_at|updated_at/);assert(f.calls.filter(p=>p.endsWith('/pulls/2')).length===2);
});
test('head/base/tree/repo mismatches and malformed pages never become complete observations',async()=>{
 for(const override of [u=>u.pathname.endsWith('/git/commits/'+head)?{sha:head,tree:{sha:'main'}}:undefined,u=>u.pathname.endsWith('/pulls/2')?{...rawPull(),number:3}:undefined,u=>u.pathname.includes('/check-runs')?{total_count:1,check_runs:[]}:undefined,u=>u.pathname.includes('/issues/2/comments')?[{id:100,user:{id:7},body:'a'.repeat(65537)}]:undefined])await assert.rejects(collect(fixture(override)),{code:'eco-snapshot-invalid'});
 let reads=0;const s=await collect(fixture(u=>u.pathname.endsWith('/pulls/2')&&++reads===2?{...rawPull(),head:{sha:'f'.repeat(40),repo:{id:1,full_name:'footprintjs/ci'}}}:undefined));assert.equal(s.facts.stable,false);
});
test('a separately pinned prior policy binds actual main ancestry and exact content',async()=>{
 const f=fixture();const s=await collect(f);assert.equal(typeof mod.collectPriorPolicy,'function');const p=await mod.collectPriorPolicy({reader:f.reader,anchor,snapshot:s});assert.equal(p.policy.ownerId,7);assert.equal(p.observation.commit,base);assert.equal(p.policy.repositories[0].held,true);
});
test('missing anchor reads no candidate policy; fake snapshots and bad prior ancestry refuse',async()=>{
 const f=fixture();const s=await collect(f);const before=f.calls.length;await assert.rejects(mod.collectPriorPolicy({reader:f.reader,anchor:null,snapshot:s}),{code:'policy-unanchored'});assert.equal(f.calls.length,before);
 await assert.rejects(mod.collectPriorPolicy({reader:f.reader,anchor,snapshot:{...s}}),{code:'eco-snapshot-unbound'});
 const bad=fixture(u=>u.pathname.includes('/compare/')?{status:'diverged',base_commit:{sha:prior},merge_base_commit:{sha:head}}:undefined);await assert.rejects(mod.collectPriorPolicy({reader:bad.reader,anchor,snapshot:await collect(bad)}),{code:'policy-stale'});
});

test('versions and work are read as finite desired state at the admitted PRIOR commit only',async()=>{
 const f=fixture(u=>u.pathname.endsWith('/contents/ledger/versions.json')?ledgerFile('versions',{schemaVersion:1,items:[]}):u.pathname.endsWith('/contents/ledger/work.json')?ledgerFile('work',{schemaVersion:1,items:[]}):undefined);
 const s=await collect(f),p=await mod.collectPriorPolicy({reader:f.reader,anchor,snapshot:s});assert.equal(typeof mod.collectLedgerState,'function','desired ledger collector feature required');
 const l=await mod.collectLedgerState({reader:f.reader,snapshot:s,context:p});assert.equal(l.versions.items.length,0);assert.equal(l.work.items.length,0);assert(f.calls.filter(p=>p.includes('/contents/ledger/')).every(p=>p.endsWith('?ref='+base)));
});
function ledgerFile(name,data){const bytes=Buffer.from(JSON.stringify(data));return {type:'file',path:'ledger/'+name+'.json',size:bytes.length,encoding:'base64',content:bytes.toString('base64'),sha:createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')};}

test('wrong source blobs, content sizes and changing prior main never bind policy',async()=>{
 for(const override of [u=>u.pathname.endsWith('/contents/ledger/policy.json')?ledgerFile('versions',{schemaVersion:1,items:[]}):undefined,u=>u.pathname.endsWith('/contents/ledger/policy.json')?{...ledgerFile('policy',{schemaVersion:1}),sha:'0'.repeat(40)}:undefined]){
  const f=fixture(override);const s=await collect(f);await assert.rejects(mod.collectPriorPolicy({reader:f.reader,anchor,snapshot:s}),{code:'policy-stale'});
 }
 const f=fixture();const s=await collect(f);const p=await mod.collectPriorPolicy({reader:f.reader,anchor,snapshot:s});
 await assert.rejects(mod.collectLedgerState({reader:f.reader,snapshot:{...s},context:p}),{code:'ledger-unavailable'});
});
test('the comments adapter never turns provider timestamps into creation-after-push history',async()=>{
 const f=fixture(u=>u.pathname.includes('/issues/2/comments')?[{id:100,user:{id:7},body:'ordinary',created_at:'2099-01-01T00:00:00Z',updated_at:'2099-01-01T00:00:00Z'}]:undefined);
 const s=await collect(f);assert.equal(s.receipt.state.entries[0].createdSequence,null);assert.equal(s.receipt.state.continuous,false);assert.equal(s.receipt.state.push,null);
});
