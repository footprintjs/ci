import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {foldVerdictObservations,observedVerdictFinding} from '../../src/eco/verdict-history.mjs';
const head='a'.repeat(40),base='b'.repeat(40),tree='c'.repeat(40);
const body=(verdict='merge',action='merge-source')=>'<!-- footprint-verdict v1 -->\nReviewer: Claude\nVerdict: '+verdict+'\nAction: '+action+'\nHead: '+head+'\nBase: '+base+'\nTree: '+tree+'\nScope: source only';
const push=(sequence=1)=>({sequence,providerId:String(sequence),kind:'head-push',head});
const comment=(sequence,id,verdict='merge',kind='comment-created')=>({sequence,providerId:String(sequence),kind,id,authorId:7,body:body(verdict)});
const batch=(events,fromSequence=1,continuous=true)=>({schemaVersion:1,repositoryId:1,pullNumber:2,fromSequence,continuous,events});
const target={repositoryId:1,pullNumber:2,ownerId:7,head,base,tree,action:'merge-source'};
const finding=r=>observedVerdictFinding(r.state,target).code;
const step=(prior,events,continuous=true)=>foldVerdictObservations(prior.state,batch(events,prior.state.throughSequence+1,continuous),prior.digest);
const initial=()=>foldVerdictObservations(null,batch([push(),comment(2,100)]));
test('continuous fixture creation after provider push matches metadata only',()=>{const r=initial();assert.equal(finding(r),'verdict-metadata-matched');assert.equal(observedVerdictFinding(r.state,target).authorized,undefined);assert.equal(r.state.entries[0].first.verdict.scope.bytes,11);});
test('deleted later hold does not resurrect older merge',()=>{const a=initial();const b=step(a,[comment(3,101,'hold')]);const c=step(b,[{sequence:4,providerId:'4',kind:'comment-deleted',id:101}]);assert.equal(finding(b),'verdict-superseded');assert.equal(finding(c),'verdict-superseded');assert.equal(c.state.entries.length,2);});
test('edited later refusal and reverted merge body never resurrect',()=>{const a=initial();const b=step(a,[comment(3,101,'changes')]);const c=step(b,[comment(4,101,'merge','comment-edited')]);assert.equal(finding(c),'verdict-superseded');const d=step(a,[{...comment(3,100,'merge','comment-edited'),body:body()+'\n\nchanged'}]);const e=step(d,[comment(4,100,'merge','comment-edited')]);assert.equal(finding(e),'verdict-superseded');});
test('a genuinely new higher-ID merge may resolve an observed refusal',()=>{const a=initial();const b=step(a,[comment(3,101,'hold')]);const c=step(b,[comment(4,102,'merge')]);assert.equal(finding(c),'verdict-metadata-matched');});
test('current-page snapshot does not fabricate creation order or coverage',()=>{const r=foldVerdictObservations(null,batch([push(),comment(2,100,'merge','comment-seen')],1,false));assert.equal(finding(r),'verdict-missing');assert.equal(r.state.entries[0].createdSequence,null);});
test('head reuse cannot revive an old comment, even with matching SHA',()=>{const a=initial();const b=step(a,[push(3)]);assert.equal(finding(b),'verdict-missing');});
test('body hash and repo/PR pins prevent altered or cross-bound saved receipts',()=>{const a=initial();const changed=structuredClone(a.state);changed.entries[0].deleted=true;assert.throws(()=>foldVerdictObservations(changed,batch([],3),a.digest),{code:'ledger-invalid'});assert.throws(()=>foldVerdictObservations(a.state,{...batch([],3),pullNumber:4},a.digest),{code:'ledger-invalid'});assert.throws(()=>foldVerdictObservations(a.state,batch([],3)),{code:'ledger-invalid'});});
test('exact batch replay is inert; gaps, unknown deletions and reordered events hold',()=>{const b=batch([push(),comment(2,100)]);const a=foldVerdictObservations(null,b);const replay=foldVerdictObservations(a.state,b,a.digest);assert.equal(replay.digest,a.digest);assert.equal(replay.replayed,true);for(const events of [[{sequence:3,providerId:'3',kind:'gap'},comment(4,102)],[{sequence:3,providerId:'3',kind:'comment-deleted',id:999}]])assert.equal(finding(step(a,events)),'verdict-missing');assert.throws(()=>step(a,[comment(2,101)]),{code:'ledger-invalid'});});
test('foreign actor, wrong action/base/tree and latest malformed owner comment refuse',()=>{const foreign=comment(3,101);foreign.authorId=8;assert.equal(finding(step(initial(),[foreign])),'verdict-metadata-matched');const wrong=comment(3,101);wrong.body=body('merge','release');assert.equal(finding(step(initial(),[wrong])),'verdict-stale');const malformed=comment(3,101);malformed.body='<!-- footprint-verdict v1 -->\nnot parsed';assert.equal(finding(step(initial(),[malformed])),'verdict-missing');});
test('native receipt data omits raw bodies and scope/footer secrets',()=>{const r=foldVerdictObservations(null,batch([push(),{...comment(2,100),body:body()+'\n\nsecret /Users/private'}]));assert(!JSON.stringify(r).includes('secret'));assert(!JSON.stringify(r).includes('/Users/'));assert(Object.isFrozen(r.state.entries[0]));});
test('pinned malformed receipt rows refuse with a named data error, never a raw crash',()=>{
 const a=initial();
 for(const mutate of [p=>p.entries=[null],p=>p.entries='not-an-array',p=>p.throughSequence='2',p=>p.push={head},p=>p.entries[0].first={kind:'parsed'},p=>p.entries.push(p.entries[0])]){
  const previous=structuredClone(a.state);mutate(previous);
  const digest=createHash('sha256').update(JSON.stringify(previous)).digest('hex');
  assert.throws(()=>foldVerdictObservations(previous,batch([],3),digest),{code:'ledger-invalid'});
 }
});

test('a newer foreign marker cannot replace owner evidence or create an owner verdict',()=>{
 const foreign=comment(3,101);foreign.authorId=8;const r=step(initial(),[foreign]);assert.equal(observedVerdictFinding(r.state,target).commentId,100);
 const onlyForeign={...comment(2,101),authorId:8};assert.equal(finding(foldVerdictObservations(null,batch([push(),onlyForeign]))),'verdict-missing');
 const seen=foldVerdictObservations(null,batch([push(),comment(2,100,'merge','comment-seen')],1,true));assert.equal(finding(seen),'verdict-missing');
});
test('damaged reader state and binding accessors never escape or execute',()=>{
 const damaged={...initial().state,entries:null};assert.doesNotThrow(()=>observedVerdictFinding(damaged,target));assert.equal(observedVerdictFinding(damaged,target).code,'verdict-missing');
 let called=false;const binding={...target};Object.defineProperty(binding,'ownerId',{get(){called=true;throw Error('private path')}});assert.doesNotThrow(()=>observedVerdictFinding(initial().state,binding));assert.equal(called,false);
});
test('H1: an unseen snapshot refusal cannot leave the older merge matched',()=>{
 for(const verdict of ['hold','changes','merge']){
  let r;assert.doesNotThrow(()=>{r=step(initial(),[comment(3,101,verdict,'comment-seen')]);});
  assert.equal(finding(r),'verdict-missing');assert.equal(r.state.continuous,false);
 }
});
test('H1 siblings: unknown-created observations, edits and withdrawals never revive a merge',()=>{
 const a=initial();const seen=step(a,[comment(3,101,'hold','comment-seen')]);
 const edited=step(seen,[comment(4,101,'merge','comment-edited')]);
 const deleted=step(edited,[{sequence:5,providerId:'5',kind:'comment-deleted',id:101}]);
 assert.equal(finding(edited),'verdict-missing');assert.equal(finding(deleted),'verdict-missing');
 const ordinary={...comment(3,101,'merge','comment-seen'),body:'ordinary unpositioned observation'};
 assert.equal(finding(step(a,[ordinary])),'verdict-missing');
 const malformed={...comment(3,101,'hold','comment-seen'),body:'<!-- footprint-verdict v1 -->\nmalformed'};assert.equal(finding(step(a,[malformed])),'verdict-missing');
 const foreign={...comment(3,101,'hold','comment-seen'),authorId:8};assert.equal(finding(step(a,[foreign])),'verdict-missing');
});

test('H2: the declared first sequence must match the first event, including initial history',()=>{
 for(const from of [2,99])assert.throws(()=>foldVerdictObservations(null,batch([push(),comment(2,100)],from,true)),{code:'ledger-invalid'});
 const a=initial();assert.throws(()=>foldVerdictObservations(a.state,batch([push(3),comment(4,101)],99,true),a.digest),{code:'ledger-invalid'});
});

test('H1: coverage can restart only with a real new push epoch and fresh creation',()=>{
 const a=step(initial(),[comment(3,101,'hold','comment-seen')]);
 assert.equal(a.state.entries[1].createdSequence,null);assert.equal(a.state.entries[1].firstObservedSequence,3);
 const b=step(a,[push(4),comment(5,102)]);assert.equal(finding(b),'verdict-metadata-matched');
 const seenAgain=step(initial(),[comment(3,100,'merge','comment-seen')]);assert.equal(finding(seenAgain),'verdict-metadata-matched');
 const unknownEdit=step(initial(),[comment(3,101,'hold','comment-edited')]);assert.equal(finding(unknownEdit),'verdict-missing');
});
test('unpositioned legacy receipts and contradictory claimed coverage remain unproven on reopen',()=>{
 const a=initial();const legacy=structuredClone(a.state);legacy.format='eco-verdict-observations-v1';delete legacy.entries[0].firstObservedSequence;
 assert.equal(observedVerdictFinding(legacy,target).code,'verdict-missing');
 const seen=structuredClone(step(a,[comment(3,101,'hold','comment-seen')]).state);seen.continuous=true;
 assert.equal(observedVerdictFinding(seen,target).code,'verdict-missing');
 const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 for(const receipt of [legacy,seen])assert.throws(()=>foldVerdictObservations(receipt,batch([],4),sha(receipt)),{code:'ledger-invalid'});
});

test('H2: empty observations cannot create coverage, and exact replay stays inert',()=>{
 const empty=foldVerdictObservations(null,batch([],99,true));assert.equal(empty.state.continuous,false);assert.equal(finding(empty),'verdict-missing');
 const a=initial();const b=step(a,[]);assert.equal(finding(b),'verdict-metadata-matched');
 const gap=foldVerdictObservations(a.state,batch([],99,true),a.digest);assert.equal(finding(gap),'verdict-missing');
 const replay=foldVerdictObservations(a.state,batch([push(),comment(2,100)]),a.digest);assert.equal(replay.digest,a.digest);
});
