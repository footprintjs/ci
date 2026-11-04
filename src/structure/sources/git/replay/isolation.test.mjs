import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync,existsSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync,spawnSync } from 'node:child_process';
import { branches } from './testing.fixture.mjs';
import { nativeGit } from './process.mjs';
import { verifyGitMerge } from './index.mjs';

function mergeHead(fixture){
  const {path,input,left,right}=fixture;
  const raw=nativeGit(path,['merge-tree','--write-tree','--name-only','--no-messages','-z',left,right]);
  return input(['commit-tree',raw.stdout.split('\0')[0],'-p',left,'-p',right],'conflicted candidate\n');
}

test('real unusual conflict paths survive native replay as exact path data',t=>{
  const file='odd \n"file.ts';
  const fixture=branches(t,true,file);
  const result=verifyGitMerge(fixture.path,mergeHead(fixture));
  assert.equal(result.replay.status,'conflicted');
  assert.deepEqual(result.replay.conflictPaths,[file]);
  assert.equal(result.coverage.complete,true);assert.deepEqual(result.findings,[]);
});

test('a live hostile driver control executes while inherited Git settings cannot reach owned replay',t=>{
  const fixture=branches(t,true),{path,left,right}=fixture;
  const head=mergeHead(fixture);
  const marker=join(path,'DRIVER-EXECUTED'),script=join(path,'.git/driver.cjs');
  const attributes=join(path,'.git/hostile-attributes'),global=join(path,'.git/hostile-config');
  writeFileSync(script,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran');`);
  writeFileSync(attributes,'*.ts merge=canary\n');
  const command=[process.execPath,script].map(value=>`'${value.replaceAll("'","'\\''")}'`).join(' ');
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:global,LC_ALL:'C'});
  for(const [key,value]of [['core.attributesFile',attributes],['merge.canary.driver',command]]){
    execFileSync('git',['config','--file',global,key,value],{env,stdio:'pipe',timeout:5000});
  }
  const control=spawnSync('git',['-C',path,'merge-tree','--write-tree',left,right],{env,stdio:'pipe',timeout:5000});
  assert.equal(control.status,0);assert.equal(existsSync(marker),true,'canary control never executed');
  rmSync(marker);
  const settings={GIT_CONFIG_GLOBAL:global,GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'core.attributesFile',
    GIT_CONFIG_VALUE_0:attributes,GIT_CONFIG_KEY_1:'merge.canary.driver',GIT_CONFIG_VALUE_1:command,GIT_DIR:'/no/such/override'};
  const previous=Object.fromEntries(Object.keys(settings).map(key=>[key,process.env[key]]));
  Object.assign(process.env,settings);
  try{
    const result=verifyGitMerge(path,head);
    assert.equal(result.headId,head);assert.equal(result.replay.status,'conflicted');
    assert.equal(result.coverage.complete,true);assert.equal(existsSync(marker),false);
  }finally{
    for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});
