import test from 'node:test';import assert from 'node:assert/strict';
import {validatePolicy,validateVersions,validateWork} from '../../src/eco/ledger-schema.mjs';
import {parseLedgerText} from '../../src/eco/json-data.mjs';
const sha='a'.repeat(40),ref='b'.repeat(64);
const policy=()=>({schemaVersion:1,ownerId:755489,releasesPaused:true,verdictRequired:true,noForce:true,repositories:[{id:1,repository:'footprintjs/ci',package:'@footprintjs/release-flow',held:true,holds:[{kind:'owner',ref}],approvalProfile:'structured-owner-comment',actions:['merge-source','policy'],gates:[{name:'check (22)',appId:15368}]}]});
const versions=()=>({schemaVersion:1,items:[{repository:'footprintjs/ci',desiredVersion:'0.1.0-beta.1',candidate:{head:sha,version:'0.1.0-beta.1'},intentRefs:[ref],reservationRefs:[ref]}]});
const work=()=>({schemaVersion:1,items:[{id:'OPS-2',repository:'footprintjs/ci',action:'merge-source',state:'review',head:sha,receiptRefs:[ref]}]});
const refuse=fn=>assert.throws(fn,{code:'ledger-invalid'});
test('finite ledger schemas admit only data and detach/freeze it',()=>{
 const p=policy();const v=validatePolicy(p);assert.equal(v.repositories[0].held,true);p.repositories[0].held=false;assert.equal(v.repositories[0].held,true);assert(Object.isFrozen(v.repositories[0]));assert.equal(validateVersions(versions()).items[0].candidate.head,sha);assert.equal(validateWork(work()).items[0].id,'OPS-2');
});
test('missing mandatory flags, arbitrary keys and bypass switches refuse',()=>{
 for(const mutate of [p=>delete p.noForce,p=>p.noForce=false,p=>p.verdictRequired=false,p=>p.plugin='evil.mjs',p=>delete p.repositories[0].held,p=>p.repositories[0].actions.push('publish-anything'),p=>p.ownerId='755489']){const p=policy();mutate(p);refuse(()=>validatePolicy(p));}
});
test('duplicate repos, gates, actions and hold refs cannot hide ambiguity',()=>{
 for(const mutate of [p=>p.repositories.push(p.repositories[0]),p=>p.repositories[0].gates.push(p.repositories[0].gates[0]),p=>p.repositories[0].actions.push('policy'),p=>p.repositories[0].holds.push(p.repositories[0].holds[0])]){const p=policy();mutate(p);refuse(()=>validatePolicy(p));}
});
test('a clear repo cannot carry unresolved holds; unknown hold types and oversized lists refuse',()=>{
 for(const mutate of [p=>p.repositories[0].held=false,p=>p.repositories[0].holds[0].kind='unknown',p=>p.repositories[0].holds[0].ref='secret/private/path',p=>p.repositories=Array.from({length:129},()=>p.repositories[0])]){const p=policy();mutate(p);refuse(()=>validatePolicy(p));}
 const p=policy();p.releasesPaused=false;assert.equal(validatePolicy(p).repositories[0].held,true);
});
test('versions are desired state with retained refs, never invented observed facts',()=>{
 for(const mutate of [p=>p.items[0].observedVersion='1.0.0',p=>p.items[0].desiredVersion='latest',p=>p.items[0].intentRefs=[ref,ref],p=>p.items[0].candidate.head='main',p=>p.items.push(p.items[0])]){const p=versions();mutate(p);refuse(()=>validateVersions(p));}
 const p=versions();p.items[0].desiredVersion=null;p.items[0].candidate=null;assert.equal(validateVersions(p).items[0].desiredVersion,null);
});
test('work actions/states/IDs and every row are finite and bounded',()=>{
 for(const mutate of [p=>p.items[0].state='execute-now',p=>p.items[0].action='npm-publish',p=>p.items[0].id='../secret',p=>p.items[0].exec='command',p=>p.items.push(p.items[0])]){const p=work();mutate(p);refuse(()=>validateWork(p));}
});
test('getters/toJSON, cycles, inherited data and sparse arrays never execute',()=>{
 let calls=0;const p=policy();Object.defineProperty(p,'plugin',{enumerable:true,get(){calls++;return 'secret'}});refuse(()=>validatePolicy(p));const q=policy();q.toJSON=()=>{calls++;return{}};refuse(()=>validatePolicy(q));const r=policy();r.repositories[0].loop=r;refuse(()=>validatePolicy(r));const s=policy();Object.setPrototypeOf(s,{hidden:true});refuse(()=>validatePolicy(s));const t=policy();delete t.repositories[0];refuse(()=>validatePolicy(t));assert.equal(calls,0);
});
test('canonical ledger text rejects duplicate JSON keys and unknown formatting',()=>{
 const p=policy();for(const s of [JSON.stringify(p),JSON.stringify(p,null,2)+'\n'])assert.equal(validatePolicy(parseLedgerText(s)).noForce,true);
 refuse(()=>parseLedgerText('{"schemaVersion":1,"schemaVersion":2}'));refuse(()=>parseLedgerText('{ "schemaVersion" : 1 }'));
});

test('wrong row types and invalid numeric semver prereleases are named schema errors',()=>{
 for(const v of [null,4,'row',[]]){const p=policy();p.repositories=[v];refuse(()=>validatePolicy(p));const w=work();w.items=[v];refuse(()=>validateWork(w));const r=versions();r.items=[v];refuse(()=>validateVersions(r));}
 const v=versions();v.items[0].desiredVersion='1.2.3-01';refuse(()=>validateVersions(v));
 for(const version of ['0.0.0','1.2.3-rc.1','1.2.3-0','1.2.3-0a']){const v=versions();v.items[0].desiredVersion=version;assert.equal(validateVersions(v).items[0].desiredVersion,version);}
});
