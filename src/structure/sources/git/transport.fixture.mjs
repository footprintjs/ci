import { execFileSync,spawnSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Owned positive control only: its external transport writes one local marker. */
export function transportFixture(t){
  const repo=mkdtempSync(join(tmpdir(),'structure-transport-'));
  t.after(()=>rmSync(repo,{recursive:true,force:true}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'});
  const git=(...args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-C',repo,...args],{env,stdio:'pipe',timeout:5000});
  git('init','--quiet','--template=');git('config','protocol.ext.allow','always');
  const marker=join(repo,'TRANSPORT-EXECUTED'),script=join(repo,'owned-control.cjs');
  writeFileSync(script,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran');process.exit(1);`);
  const escaped=value=>value.replaceAll('%','%%').replaceAll(' ','% ');
  const url=`ext::${escaped(process.execPath)} ${escaped(script)}`;
  const args=['fetch','--no-write-fetch-head',url];
  const control=()=>spawnSync('git',['-c','protocol.allow=never','-C',repo,...args],{env,stdio:'pipe',timeout:5000});
  return {repo,marker,args,control};
}
