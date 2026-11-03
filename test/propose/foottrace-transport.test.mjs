import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {foottraceTransportPort} from '../../src/propose/foottrace-transport.mjs';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {createFoottraceCurrentPreparationReader} from '../../src/propose/current-preparation.mjs';
import {proposerFixture} from './proposer-provider-fixture.mjs';
import {zip} from './artifact-fixture.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture({change=()=>{},downloadChange=response=>response}={}) {
 let f;const calls=[];let bytes;
 const archive=()=>bytes??=zip([['manifest.json',JSON.stringify({repositoryId:f.context.repository.id,runId:500,runAttempt:1,jobId:600,sourceSha:f.context.sha,
  tree:f.prepared.sourceTree,package:'foottrace',version:f.prepared.version})+'\n'],
  ['proposal.json',JSON.stringify({base:f.context.sha,tree:f.prepared.sourceTree,repository:f.context.repository,prepared:f.prepared.prepared})+'\n']]);
 f=proposerFixture({change,extra:path=>{
  if(path.endsWith('/actions/artifacts/800'))return {id:800,name:'foottrace-123-500-1-prepare',expired:false,size_in_bytes:archive().length,digest:'sha256:'+hash(archive()),
   workflow_run:{id:500,head_sha:f.context.sha,repository_id:123,head_repository_id:123}};
  if(path.endsWith('/actions/artifacts/800/zip'))return {unowned:'redirect is the actual transport response'};
 },http:path=>path.endsWith('/actions/artifacts/800/zip')?new Response(null,{status:302,headers:{location:'https://synthetic.blob.core.windows.net/test/artifact.zip?sig=PRIVATE-SIGNED-URL'}}):null,
 download:(url,options)=>{
  calls.push({hasAuth:new Headers(options.headers).has('authorization'),redirect:options.redirect,method:options.method});
  return downloadChange(new Response(archive(),{headers:{'content-type':'application/zip'}}));
 }});
 return {...f,downloads:calls,archive};
}
async function acquire(f) {
 try {
  const port=foottraceTransportPort(f.transport),readCurrentProposer=createFoottraceProposerReader(f),current=await readCurrentProposer(f.prepared);
  return await createFoottraceCurrentPreparationReader({api:port.api,context:f.context,artifactId:800,readCurrentProposer})(f.prepared,current);
 } catch {return {valid:false};}
}
test('the unchanged native producer/archive guards compose through actual private-App HTTP and anonymous ZIP redirects',async()=>{
 const f=fixture(),r=await acquire(f);assert.equal(r.valid,true);assert.equal(r.reference.archiveDigest,hash(f.archive()));assert.equal(f.downloads.length,2);
 assert.ok(f.downloads.every(call=>call.hasAuth===false&&call.redirect==='error'&&call.method==='GET'));assert.equal(r.authorized,false);
 assert.equal(JSON.stringify(r).includes('PRIVATE-SIGNED-URL'),false);assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);
 const facts=foottraceTransportPort(f.transport).transportFacts();assert.ok(facts.fetchAttempts>2);assert.equal(facts.exhausted,false);
});
test('native App metadata still uses the private signed GET, without forwarding that credential to an archive host',async()=>{
 const f=fixture(),r=await acquire(f);assert.equal(r.valid,true);assert.ok(f.seen.some(call=>call.authKind==='verified-synthetic-app-jwt'));
 assert.ok(f.downloads.every(call=>call.hasAuth===false));
});
test('bad redirected archive bytes remain refused by the unchanged native ZIP and whole-proposal guards',async()=>{
 const f=fixture({downloadChange:()=>new Response('different bytes',{headers:{'content-type':'application/zip'}})});assert.equal((await acquire(f)).valid,false);
});
test('a completed native producer cannot acquire an archive through the new transport',async()=>{
 const f=fixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}});
 assert.equal((await acquire(f)).valid,false);assert.equal(f.downloads.length,0);
});
test('saved JSON cannot manufacture a private native HTTP transport',()=>{
 assert.throws(()=>foottraceTransportPort(JSON.parse('{"readOnly":true}')));
});

test('private native transport repository identity cannot be rebound by a caller context',async()=>{
 const f=proposerFixture();f.context.repository.id=999;
 const r=await createFoottraceProposerReader(f)(f.prepared);assert.equal(r.valid,false);assert.equal(f.seen.length,0);
});
