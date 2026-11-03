import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {proposerFixture,PRIVATE} from './proposer-provider-fixture.mjs';
const read=async f=>createFoottraceProposerReader(f)(f.prepared);
test('current producer identity reuses private App JWT and unchanged native running-run admission',async()=>{
 const f=proposerFixture(),r=await read(f);assert.equal(r.valid,true);assert.equal(r.scope,'current-proposer-identity-only');
 assert.equal(r.identity.runId,500);assert.equal(r.identity.prepareJobId,600);assert.equal(r.identity.proposalJobId,601);
 assert.equal(r.privateAppIdentityAdmitted,true);assert.equal(r.writerCredentialBindingAdmitted,false);assert.equal(r.retainedEligibilityAdmitted,false);assert.equal(r.authorized,false);
 assert.equal(f.seen.filter(x=>x.authKind==='verified-synthetic-app-jwt').length,2);assert.ok(f.seen.every(x=>!x.path.startsWith('/apps/')));
 assert.equal(JSON.stringify(r).includes(PRIVATE),false);assert.equal(JSON.stringify(r).includes('offline_test_token'),false);assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);
});
test('a completed historical producer is never retargeted as the current running run',async()=>{
 const r=await read(proposerFixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}}));
 assert.equal(r.valid,false);assert.equal(r.nativeReason,'current-run-status');
});
for(const [name,change] of [
 ['wrong current run ID',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.id=501;}],
 ['wrong current attempt',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.run_attempt=2;}],
 ['wrong run source',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.head_sha='f'.repeat(40);}],
 ['wrong head repository',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.head_repository={id:999,full_name:'fork/foottrace'};}],
 ['wrong native workflow',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.path='.github/workflows/other.yml';}],
 ['wrong original event',(d,p)=>{if(p.endsWith('/actions/runs/500'))d.event='pull_request';}],
 ['failed prepare job',(d,p)=>{if(d.jobs)d.jobs[0].conclusion='failure';}],
 ['completed proposal job',(d,p)=>{if(d.jobs){d.jobs[1].status='completed';d.jobs[1].conclusion='success';}}],
 ['duplicate native producer job',(d,p)=>{if(d.jobs){d.jobs.push({...d.jobs[1],id:602});d.total_count++;}}],
 ['wrong private App client',(d,p)=>{if(p==='/app')d.client_id='another_client';}],
 ['wrong private App slug',(d,p)=>{if(p==='/app')d.slug='another-app';}],
 ['wrong public bot type',(d,p)=>{if(p.startsWith('/users/'))d.type='User';}],
 ['non-writable repository',(d,p)=>{if(p==='/repos/footprintjs/foottrace')d.permissions.push=false;}],
 ['archived repository',(d,p)=>{if(p==='/repos/footprintjs/foottrace')d.archived=true;}],
 ['changed current main',(d,p)=>{if(p.endsWith('/heads/main'))d.object.sha='f'.repeat(40);}],
 ['changed current source tree',(d,p)=>{if(p.includes('/git/commits/'))d.tree.sha='f'.repeat(40);}],
 ['changed adjacent App identity',(d,p,n)=>{if(p==='/app'&&n.appReads===2)d.id=78;}],
])test(name+' refuses without private HTTP payloads',async()=>{
 const r=await read(proposerFixture({change}));assert.equal(r.valid,false);assert.equal(r.authorized,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('HTTP403 private App metadata never becomes absence or permission',async()=>{
 const r=await read(proposerFixture({http:p=>p==='/app'?new Response(PRIVATE,{status:403}):null}));assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes(PRIVATE),false);
});
test('an oversize identity response is refused before native JSON admission',async()=>{
 const r=await read(proposerFixture({http:(p,d)=>p==='/app'?new Response(JSON.stringify(d),{headers:{'content-type':'application/json','content-length':String(2*1024*1024+1)}}):null}));assert.equal(r.valid,false);
});
test('a redirect cannot carry native App identity elsewhere',async()=>{
 const r=await read(proposerFixture({http:p=>p==='/app'?new Response('',{status:302,headers:{location:'https://other.invalid/private'}}):null}));assert.equal(r.valid,false);
});
test('a saved or invented transport object cannot acquire current identity',async()=>{
 const f=proposerFixture();f.transport={readOnly:true};const r=await read(f);assert.equal(r.valid,false);assert.equal(f.seen.length,0);
});

test('native non-JSON HTTP bodies cannot be relabelled as valid identity JSON',async()=>{
 const r=await read(proposerFixture({http:(p,d)=>p==='/app'?new Response(JSON.stringify(d),{headers:{'content-type':'text/html'}}):null}));
 assert.equal(r.valid,false);
});

test('streamed identity bytes are cancelled at the response bound before parsing',async()=>{
 let cancelled=false;
 const r=await read(proposerFixture({http:p=>p==='/app'?new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.enqueue(new Uint8Array([32]));c.close();},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}):null}));
 assert.equal(r.valid,false);assert.equal(cancelled,true);
});
test('aggregate acquisition limits cannot be raised by oversized but shaped identity replies',async()=>{
 const r=await read(proposerFixture({change:d=>{d.unownedPadding='x'.repeat(512*1024);}}));assert.equal(r.valid,false);
});
