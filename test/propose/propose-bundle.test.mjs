import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {proposalBootstrapFixture,PRIVATE} from './proposal-bootstrap-provider-fixture.mjs';
const require=createRequire(import.meta.url);
const bundle=path.resolve('dist/propose.cjs');
async function physical(t,esm=false){
 const bytes=await readFile(bundle).catch(()=>null);assert.ok(bytes,'prebuilt shared inspection bundle must exist');
 const at=await mkdtemp(path.join(os.tmpdir(),'shared-propose-bundle-'));t.after(()=>rm(at,{recursive:true,force:true}));
 const file=path.join(at,'propose.cjs');await copyFile(bundle,file);
 const module=esm?(await import(pathToFileURL(file).href)).default:require(file);
 assert.equal(typeof module.runFoottraceProposalBootstrapInspection,'function');
 assert.deepEqual(Object.keys(module),['runFoottraceProposalBootstrapInspection']);
 return module;
}
test('prebuilt shared inspection metadata binds exact bytes and only native runtime imports',async()=>{
 const metadata=await readFile('dist/propose-metadata.json','utf8').then(JSON.parse).catch(()=>null);assert.ok(metadata);
 const bytes=await readFile(bundle);assert.equal(metadata.schemaVersion,1);assert.equal(metadata.purpose,'proposal-bootstrap-inputs-only');assert.equal(metadata.writerAuthority,false);assert.equal(metadata.format,'cjs');assert.equal(metadata.target,'node22');
 assert.equal(metadata.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert(metadata.inputs.some(x=>x.path==='src/propose/proposal-bootstrap.mjs'));
 assert(metadata.inputs.some(x=>x.path==='src/propose/proposal-invocation.mjs'));
 assert(metadata.inputs.some(x=>x.path==='src/guards/release-github.cjs'));
 assert(metadata.inputs.some(x=>x.path.startsWith('node_modules/footprintjs/')));
 assert(metadata.inputs.some(x=>x.path.startsWith('node_modules/foottrace/')));
 assert(metadata.external.length>0);assert(metadata.external.every(x=>x.startsWith('node:')));
});
for(const esm of [false,true])test('physical '+(esm?'ESM':'CJS')+' bundle invokes the same native observed input flow without candidate dependencies',async t=>{
 const module=await physical(t,esm),fixture=await proposalBootstrapFixture(),input=fixture.makeInvocation();
 const result=await module.runFoottraceProposalBootstrapInspection(input);
 assert.equal(result.status,'proposal-bootstrap-only');assert.equal(result.record.complete,true);assert(fixture.calls.length>0);
 assert.equal(result.backend.context.sha,fixture.M);assert.equal(result.report.authorized,false);assert.equal(result.report.executedWrites,0);
 assert.equal(result.report.writerCredentialBindingAdmitted,false);
 assert.equal('GH_TOKEN' in input.env,false);assert.equal('APP_PRIVATE_KEY' in input.env,false);
 assert.equal(JSON.stringify(result.record).includes(PRIVATE),false);assert.equal(JSON.stringify(result).includes('BEGIN PRIVATE KEY'),false);
});
test('the actual prebuilt bundle refuses a foreign current job before any HTTP',async t=>{
 const module=await physical(t),fixture=await proposalBootstrapFixture({changeEnv:e=>{e.GITHUB_JOB='other';}});
 const input=fixture.makeInvocation(),result=await module.runFoottraceProposalBootstrapInspection(input);
 assert.equal(result.status,'held');assert.equal(result.backend,null);assert.equal(fixture.calls.length,0);
 assert.equal('GH_TOKEN' in input.env,false);assert.equal('APP_PRIVATE_KEY' in input.env,false);
});
test('the actual prebuilt bundle discards backend inputs when native capture is incomplete',async t=>{
 const module=await physical(t),fixture=await proposalBootstrapFixture();
 const result=await module.runFoottraceProposalBootstrapInspection({...fixture.makeInvocation(),recordLimitBytes:256});
 assert.equal(result.status,'incomplete');assert.equal(result.backend,null);assert.equal(result.report.authorized,false);
});
test('ordinary hosted checks also reject drift in both new prebuilt inspection artifacts',async()=>{
 const workflow=await readFile('.github/workflows/check.yml','utf8');
 const drift=workflow.split('\n').find(line=>line.includes('git diff --exit-code'));
 assert.ok(drift);assert.ok(drift.includes('dist/propose.cjs'));assert.ok(drift.includes('dist/propose-metadata.json'));
});
