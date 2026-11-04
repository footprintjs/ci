import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './run.mjs';
import { branches } from '../sources/git/replay/testing.fixture.mjs';
import { nativeGit } from '../sources/git/replay/process.mjs';

function capture(args){
  let output='',errors='';
  const exit=runCli(args,{stdout:text=>output+=text,stderr:text=>errors+=text});
  return {exit,output,errors};
}

test('verify-merge uses actual parents and exposes JSON/text without executing candidate code',t=>{
  const {path,git,input,left}=branches(t);
  writeFileSync(join(path,'package.json'),'{"scripts":{"prepare":"node canary.cjs"}}');
  writeFileSync(join(path,'canary.cjs'),"require('node:fs').writeFileSync(__dirname+'/EXECUTED','bad');");
  git('add','.');git('commit','--quiet','-m','candidate data');
  const right=git('rev-parse','HEAD');
  const tree=nativeGit(path,['merge-tree','--write-tree','--name-only','--no-messages','-z',left,right]).stdout.split('\0')[0];
  const head=input(['commit-tree',tree,'-p',left,'-p',right],'candidate\n');
  const args=['verify-merge','--repo',path,'--head',head];
  const result=capture(args);
  assert.equal(result.exit,0,result.errors);
  const report=JSON.parse(result.output);
  assert.equal(report.verification,'merge');assert.deepEqual(report.parents,[left,right]);
  assert.equal(report.coverage.complete,true);assert.equal(report.replay.status,'clean');
  assert.equal(existsSync(join(path,'EXECUTED')),false);
  const text=capture([...args,'--format','text']);
  assert.equal(text.exit,0,text.errors);assert.match(text.output,/Merge replay observations:[\s\S]*Findings: 0[\s\S]*Unverified: 0/);
});

test('merge command separates unsupported parent scope from input errors and rejects an invented base',t=>{
  const {path,right}=branches(t);
  const unsupported=capture(['verify-merge','--repo',path,'--head',right]);
  assert.equal(unsupported.exit,0,unsupported.errors);
  assert.equal(JSON.parse(unsupported.output).coverage.complete,false);
  const missing=capture(['verify-merge','--repo',path,'--head','missing-ref']);
  assert.equal(missing.exit,2);assert.equal(JSON.parse(missing.errors).status,'tool-error');
  const base=capture(['verify-merge','--repo',path,'--base',right]);
  assert.equal(base.exit,2);assert.match(JSON.parse(base.errors).message,/actual parents/i);
});
