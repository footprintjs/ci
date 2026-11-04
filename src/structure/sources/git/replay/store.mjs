import { mkdtempSync,mkdirSync,writeFileSync,rmSync,statSync } from 'node:fs';
import { join,isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { successfulGit } from './process.mjs';

export function withReplayStore(repo,objectWidth,observe){
  const raw=successfulGit(repo,['rev-parse','--path-format=absolute','--git-path','objects']);
  const objects=raw.endsWith('\n')?raw.slice(0,-1):raw;
  if(!isAbsolute(objects)||/[\0\r\n]/.test(objects)||!statSync(objects).isDirectory())throw new Error('Unsupported source object-store path.');
  const store=mkdtempSync(join(tmpdir(),'structure-replay-'));
  try{
    successfulGit(store,['init','--bare','--quiet','--template=',`--object-format=${objectWidth===64?'sha256':'sha1'}`]);
    mkdirSync(join(store,'objects/info'),{recursive:true});
    writeFileSync(join(store,'objects/info/alternates'),objects+'\n');
    return observe(store);
  }finally{rmSync(store,{recursive:true,force:true});}
}
