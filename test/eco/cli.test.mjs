import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const file=new URL('../../bin/eco.mjs',import.meta.url);const mod=existsSync(file)?await import(file):{};
const parser=args=>{assert.equal(typeof mod.parseEcoArguments,'function','eco CLI feature required');return mod.parseEcoArguments(args);};
test('CLI accepts only finite read-only status/explain commands and separately pinned owner inputs',()=>{
 assert.equal(parser(['status']).command,'status');assert.equal(parser(['status','--repo','footprintjs/ci','--pr','2']).target.pullNumber,2);
 for(const args of [['publish'],['status','--live','true'],['status','--repo','other/repo','--pr','2'],['status','--pr','0'],['status','--repo','footprintjs/ci'],['status','--history','made-up.json'],['status','--policy-commit','a'.repeat(40)],['status','--pr','2','--pr','3']])assert.throws(()=>parser(args),{code:'eco-arguments'});
 const p=parser(['status','--repo','footprintjs/ci','--pr','2','--policy-commit','a'.repeat(40),'--policy-sha256','b'.repeat(64),'--owner-id','7']);assert.equal(p.anchor.ownerId,7);
});
test('saved evidence reopens through foottrace without constructing a transport or rerunning the workflow',async()=>{
 assert.equal(typeof mod.main,'function');const dir=mkdtempSync(join(tmpdir(),'eco-cli-')),out=join(dir,'fresh');const stdout=[],stderr=[];let calls=0;
 try{
  const deps={stdout:s=>stdout.push(s),stderr:s=>stderr.push(s),fetcher:async()=>{calls++;throw Error('secret /Users/private');},env:{}};
  assert.equal(await mod.main(['status','--repo','footprintjs/ci','--pr','2','--output',out],deps),2);assert.equal(calls,1);assert.doesNotMatch(stdout.join('')+stderr.join(''),/secret|\/Users\/private/);
  const record=join(out,'record.json');assert.equal(JSON.parse(readFileSync(record)).complete,true);const manifest=JSON.parse(readFileSync(join(out,'manifest.json')));assert.match(manifest.recordSha256,/^[a-f0-9]{64}$/);
  const noNetwork={...deps,fetcher:()=>{throw Error('reopen must not construct transport');}};assert.equal(await mod.main(['explain','--record',record,'--key','reportFacts'],noNetwork),0);assert.equal(calls,1);assert.match(stdout.at(-1),/report.*wrote: reportFacts/);
  assert.equal(await mod.main(['status','--output',out],deps),1);assert.equal(JSON.parse(readFileSync(record)).complete,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
