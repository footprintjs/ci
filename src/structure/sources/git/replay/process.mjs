import { spawnSync } from 'node:child_process';

export function nativeGit(repo,args){
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',
    GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_ALLOW_PROTOCOL:'',GIT_ATTR_NOSYSTEM:'1',LC_ALL:'C'});
  const result=spawnSync('git',['--no-pager','--no-optional-locks',
    '-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','core.attributesFile=/dev/null',
    '-c','gc.auto=0','-c','maintenance.auto=false','-c','protocol.allow=never','-C',repo,...args],
  {env,maxBuffer:256*1024*1024,timeout:30_000,stdio:['pipe','pipe','pipe']});
  if(result.error||!Number.isInteger(result.status))throw new Error('Git replay process did not complete within its tool limits.');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  return {exitCode:result.status,stdout:decoder.decode(result.stdout),stderr:decoder.decode(result.stderr)};
}

export function successfulGit(repo,args){
  const result=nativeGit(repo,args);
  if(result.exitCode!==0)throw new Error('Cannot read or initialize replay Git data.');
  return result.stdout;
}
