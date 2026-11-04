import { execFileSync } from 'node:child_process';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function repository(t,file='file.ts'){
  const path=mkdtempSync(join(tmpdir(),'structure-replay-fixture-'));
  t.after(()=>rmSync(path,{recursive:true,force:true}));
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',LC_ALL:'C'});
  const input=(args,data)=>execFileSync('git',['--no-pager','-c','core.hooksPath=/dev/null',
    '-c','core.fsmonitor=false','-c','commit.gpgSign=false','-c','tag.gpgSign=false','-C',path,...args],
  {env,input:data,encoding:'utf8',stdio:'pipe',timeout:5000}).trim();
  const git=(...args)=>input(args);
  git('init','--quiet','--initial-branch=main','--template=');
  git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(path,file),'base\n');git('add','.');git('commit','--quiet','-m','base');
  return {path,git,input};
}

export function branches(t,conflict=false,file='file.ts'){
  const fixture=repository(t,file),{path,git}=fixture;
  const base=git('rev-parse','HEAD');
  git('checkout','--quiet','-b','left');
  writeFileSync(join(path,conflict?file:'left.ts'),'left\n');git('add','.');git('commit','--quiet','-m','left');
  const left=git('rev-parse','HEAD');
  git('checkout','--quiet','-b','right',base);
  writeFileSync(join(path,conflict?file:'right.ts'),'right\n');git('add','.');git('commit','--quiet','-m','right');
  return {...fixture,base,left,right:git('rev-parse','HEAD')};
}
