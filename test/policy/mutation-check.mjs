// Deliberate breaks run only in an isolated copy; no production source is edited.
import {mkdtempSync,cpSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cases=[
 ['mandatory-security','src/policy.mjs','if (!admitSecurity(facts.security, w.expected, config.requiredGates.slice(3)))','if (false)','test/policy/security.test.mjs','verdict requires'],
 ['later-objection','src/guards/release-control.cjs',"if ([...effective.values()].some((r) => r.state === 'CHANGES_REQUESTED'))",'if (false)','test/policy/guards.test.mjs','authority preserves'],
 ['wrong-reviewed-tree','src/guards/release-control.cjs','w.commit.tree?.sha !== e.tree','false','test/upstream/test/release/release-control.test.mjs',null],
 ['old-grant','src/guards/release-control.cjs','grant.fresh === true','true','test/upstream/test/release/release-control.test.mjs',null],
 ['unknown-submission','src/guards/release-control.cjs','if (w.journal || w.registry)','if (w.registry)','test/upstream/test/release/release-control.test.mjs',null],
 ['producer-source','src/guards/release-control.cjs','a.workflow_run.head_sha !== e.sourceSha','false','test/policy/guards.test.mjs','archive adapter'],
 ['approval-disclosure','src/policy.mjs','r.body.includes("Delegated approval")' ,'true','test/policy/guards.test.mjs','authority preserves'],
 ['configuration-hook','src/policy.mjs','keys.length !== names.length || keys.some((k) => typeof k !== "string" || !names.includes(k))' ,'false' ,'test/policy/config.test.mjs','configuration rejects unknown keys'],
];
const results=[];
for(const [name,file,from,to,test,pattern] of cases){
 const dir=mkdtempSync(join(tmpdir(),'shared-release-mutation-'));
 try{
  for(const folder of ['src','test','provenance','configs'])cpSync(join(root,folder),join(dir,folder),{recursive:true});
  const target=join(dir,file),source=readFileSync(target,'utf8');if(!source.includes(from))throw Error('mutation-target-missing:'+name);
  writeFileSync(target,source.replace(from,to));
  const args=['--test',...(pattern?['--test-name-pattern',pattern]:[]),test];
  const run=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8',timeout:30000});
  if(run.error)throw run.error;
  const output=run.stdout+'\n'+run.stderr;
  const assertionFailure=/ERR_ASSERTION|AssertionError/.test(output);
  const setupFailure=/ERR_MODULE_NOT_FOUND|Cannot find module|SyntaxError|mutation-target-missing/.test(output);
  const killed=run.status!==0 && assertionFailure && !setupFailure;
  results.push({name,killed,status:run.status,assertionFailure,setupFailure});
  if(!killed)throw Error('survived:'+name+' '+run.status+' '+run.stdout+' '+run.stderr);
 }finally{rmSync(dir,{recursive:true,force:true});}
}
process.stdout.write(JSON.stringify({mutations:results},null,2)+'\n');
