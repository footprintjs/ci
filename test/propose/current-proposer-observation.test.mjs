import test from 'node:test';
import assert from 'node:assert/strict';
import {proposerFixture} from './proposer-provider-fixture.mjs';
import * as module from '../../src/propose/current-proposer.mjs';
function reader(f){
 assert.equal(typeof module.createFoottraceProposerObservation,'function','single actual native producer observation missing');
 return module.createFoottraceProposerObservation({transport:f.transport,context:f.context});
}
test('one native identity observation keeps every strict producer predicate and grants nothing',async()=>{
 const f=proposerFixture(),value=await reader(f)(f.prepared);
 assert.equal(value.valid,true);assert.equal(value.nativeIdentityPhases,1);assert.equal(value.authorized,false);
 assert.equal(value.writerCredentialBindingAdmitted,false);assert.equal(value.privateAppIdentityAdmitted,false);
 assert.equal(value.identity.sourceSha,f.context.sha);assert.equal(value.appIdentityObservation,'cached-key-holder-facts');
 assert.equal(f.seen.some(r=>r.path==='/app'),false);
});
for(const kind of ['completed-run','wrong-attempt','wrong-source','wrong-prepare','wrong-proposal','writer-permission'])test('single native observation refuses '+kind,async()=>{
 const f=proposerFixture({change:(data,path)=>{
  if(path.endsWith('/actions/runs/500')){
   if(kind==='completed-run'){data.status='completed';data.conclusion='success';}
   if(kind==='wrong-attempt')data.run_attempt++;
   if(kind==='wrong-source')data.head_sha='f'.repeat(40);
  }
  if(path.includes('/jobs')&&data.jobs){
   if(kind==='wrong-prepare')data.jobs.find(j=>j.name==='prepare').conclusion='failure';
   if(kind==='wrong-proposal')data.jobs.find(j=>j.name==='proposal').status='completed';
  }
  if(kind==='writer-permission'&&path==='/repos/footprintjs/foottrace')data.permissions.push=false;
 }});
 assert.equal((await reader(f)(f.prepared)).valid,false);
});
test('fresh observations around an outer operation detect current producer drift, never return cached running facts',async()=>{
 let later=false;const f=proposerFixture({change:(data,path)=>{if(later&&path.endsWith('/actions/runs/500')){data.status='completed';data.conclusion='success';}}});
 const read=reader(f);assert.equal((await read(f.prepared)).valid,true);later=true;assert.equal((await read(f.prepared)).valid,false);
});
