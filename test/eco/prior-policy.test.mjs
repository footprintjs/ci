import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {bindPriorPolicy,isBoundPriorPolicy,priorProfile,checkRetainedMinimums} from '../../src/eco/prior-policy.mjs';
import {validatePolicy} from '../../src/eco/ledger-schema.mjs';
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40),ref='d'.repeat(64);const sha=x=>createHash('sha256').update(x).digest('hex');
const p=()=>({schemaVersion:1,ownerId:755489,releasesPaused:false,verdictRequired:true,noForce:true,repositories:[{id:1,repository:'footprintjs/ci',package:'@footprintjs/release-flow',held:true,holds:[{kind:'owner',ref}],approvalProfile:'structured-owner-comment',actions:['merge-source','policy'],gates:[{name:'consumer',appId:15368}]}]});
const inputs=()=>{const body=JSON.stringify(p());return{body,anchor:{repository:'footprintjs/ci',commit:b,bodySha256:sha(body),ownerId:755489},evidence:{repository:'footprintjs/ci',ref:'refs/heads/main',commit:b,anchorCommit:b,anchorAncestor:true,candidateRepository:'footprintjs/ci',candidateHead:a,candidateBase:b}};};
const bind=x=>bindPriorPolicy(x.body,x.anchor,x.evidence);
test('separate pinned prior policy binds main evidence without granting effect authority',()=>{const x=inputs(),r=bind(x);assert(isBoundPriorPolicy(r));assert.equal(r.attribution,'cooperative-owner-account');assert.equal(priorProfile(r,1,'footprintjs/ci').held,true);assert.equal(r.authorized,undefined);assert.equal(r.policy.releasesPaused,false);assert.equal(r.policy.repositories[0].held,true);});
test('missing operator anchor and raw lookalike context never count as trusted policy',()=>{assert.throws(()=>bindPriorPolicy('{}',null,{}),{code:'policy-unanchored'});assert(!isBoundPriorPolicy({policy:p()}));assert.throws(()=>priorProfile({policy:p()},1,'footprintjs/ci'),{code:'policy-unanchored'});});
test('candidate cannot authorize itself by changing policy, owner, prior base or ancestry',()=>{
 for(const mutate of [x=>x.body=x.body.replace('755489','755490'),x=>x.anchor.ownerId=7,x=>x.evidence.commit=a,x=>x.evidence.candidateBase=c,x=>x.evidence.anchorAncestor=false,x=>x.evidence.ref='refs/heads/candidate',x=>x.evidence.anchorCommit=c]){const x=inputs();mutate(x);assert.throws(()=>bind(x),{code:'policy-stale'});}
});
test('a different library source still requires the independently pinned CI policy',()=>{const x=inputs();x.evidence.candidateRepository='footprintjs/foottrace';x.evidence.candidateBase=c;assert(isBoundPriorPolicy(bind(x)));assert.throws(()=>priorProfile(bind(x),2,'footprintjs/foottrace'),{code:'policy-repository-missing'});});
test('known unresolved holds, native profile and mandatory consumer gate cannot be silently dropped',()=>{
 const minimums={complete:true,repositories:[{repository:'footprintjs/ci',held:true,holdRefs:[ref],approvalProfile:'structured-owner-comment',gates:[{name:'consumer',appId:15368}]}]};
 assert(checkRetainedMinimums(validatePolicy(p()),minimums));
 for(const mutate of [q=>{q.repositories[0].held=false;q.repositories[0].holds=[];},q=>q.repositories[0].holds=[],q=>q.repositories[0].approvalProfile='foottrace-disclosed-user',q=>q.repositories[0].gates=[{name:'unrelated',appId:15368}]]){const q=p();mutate(q);assert.throws(()=>checkRetainedMinimums(validatePolicy(q),minimums),{code:'policy-minimums-lost'});}
 assert.throws(()=>checkRetainedMinimums(validatePolicy(p()),{...minimums,complete:false}),{code:'policy-inventory-incomplete'});
});
test('minimum retention requires validated policy and bounded well-shaped baseline data',()=>{
 const minimums={complete:true,repositories:[]};assert.throws(()=>checkRetainedMinimums(p(),minimums),{code:'policy-unanchored'});
 const expected={repository:'footprintjs/ci',held:true,holdRefs:[ref],approvalProfile:'structured-owner-comment',gates:[{name:'consumer',appId:15368}]};
 for(const mutate of [x=>x.repositories=[null],x=>x.repositories[0].gates=[null],x=>x.repositories[0].holdRefs=[{secret:'value'}],x=>x.repositories[0].approvalProfile='custom-hook',x=>x.repositories.push(x.repositories[0])]){const q={complete:true,repositories:[structuredClone(expected)]};mutate(q);assert.throws(()=>checkRetainedMinimums(validatePolicy(p()),q),{code:'ledger-invalid'});}
});
