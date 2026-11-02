// Isolated driver/source breaks. Every test uses cooperative local HTTP fixtures;
// no real provider, install, publisher or source-worktree mutation is invoked.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync,symlinkSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=process.env.ECO_DRIVER_MUTATION_EVIDENCE;
if(out)mkdirSync(out,{recursive:true});
const cases=[
 ['fixed-api-origin',[['src/eco/github-reader.mjs',"fetcher('https://api.github.com'+request.path", "fetcher('https://evil.test'+request.path"]]],
 ['no-redirect-follow',[['src/eco/github-reader.mjs',"redirect:'manual'","redirect:'follow'"]]],
 ['request-budget',[['src/eco/github-reader.mjs',"if(requests>=requestLimit)refuse('eco-request-limit');",'']]],
 ['cumulative-response-budget',[['src/eco/github-reader.mjs','||bytes>byteLimit','']]],
 ['prior-ancestry',[['src/eco/collector.mjs',"if(!['identical','ahead'].includes(comparison.status)||comparison.base_commit?.sha!==a.commit||comparison.merge_base_commit?.sha!==a.commit)refuse('policy-stale');",'']]],
 ['snapshot-drift',[['src/eco/collector.mjs','JSON.stringify(first)===JSON.stringify(last)','true']]],
 ['seen-not-created',[['src/eco/collector.mjs',"kind:'comment-seen'","kind:'comment-created'"]]],
 ['prior-not-candidate',[['src/eco/collector.mjs',"readLedgerBody(reader,'policy',current)","readLedgerBody(reader,'policy',snapshot.facts.head)"]]],
 ['required-check-app',[['src/eco/status-findings.mjs','&&c.appId===gate.appId','']]],
 ['latest-check-attempt',[['src/eco/status-findings.mjs','(a,b)=>b.id-a.id','(a,b)=>a.id-b.id']]],
 ['retain-repo-hold',[['src/eco/status-findings.mjs','if(profile.held||profile.holds.length)','if(false)']]],
 ['no-effect-authority',[['src/eco/status-flow.mjs','authorized:false,executedWrites:0,observationAvailable','authorized:true,executedWrites:0,observationAvailable']]],
 ['incomplete-record',[['src/eco/status-flow.mjs',"status:record.complete?report.status:'incomplete'",'status:report.status']]],
 ['reopen-without-provider',[['bin/eco.mjs',"if(options.command==='explain'){","if(options.command==='explain'){await fetcher('https://api.github.com/repos/footprintjs/ci');"]]],
 ['exclusive-evidence-output',[['bin/eco.mjs',"mkdir(output,{mode:0o700})","mkdir(output,{mode:0o700,recursive:true})"],['bin/eco.mjs',"join(output,name),'wx'","join(output,name),'w'"]]],
];
cases.push(
 ['saved-receipt-discarded',[['src/eco/status-flow.mjs','scope.observeReceipt=snapshot?jsonData(snapshot.receipt.state):null;','scope.observeReceipt=null;']]],
 ['saved-receipt-dependency',[['src/eco/status-flow.mjs','JSON.stringify(scope.observeReceipt)','JSON.stringify(snapshot.receipt.state)']]],
);
const results=[];
for(const [name,edits] of cases){
 const dir=mkdtempSync(join(tmpdir(),'eco-driver-mutation-'));
 try{
  for(const folder of ['src','bin','test/eco','schemas'])cpSync(join(root,folder),join(dir,folder),{recursive:true});
  cpSync(join(root,'package.json'),join(dir,'package.json'));symlinkSync(join(root,'node_modules'),join(dir,'node_modules'),'dir');
  for(const [file,from,to] of edits){const path=join(dir,file),body=readFileSync(path,'utf8');if(body.split(from).length!==2)throw Error('mutation-target-not-unique:'+name);writeFileSync(path,body.replace(from,to));}
  const args=['--test',...readdirSync(join(dir,'test/eco')).filter(n=>n.endsWith('.test.mjs')).map(n=>'test/eco/'+n)];
  const run=spawnSync(process.execPath,args,{cwd:dir,encoding:'utf8',timeout:30000});if(run.error)throw run.error;
  const output=run.stdout+'\n'+run.stderr,assertionFailure=/ERR_ASSERTION|AssertionError/.test(output),setupFailure=/ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|ReferenceError/.test(output);
  const result={name,status:run.status,signal:run.signal,assertionFailure,setupFailure,killed:run.status!==0&&assertionFailure&&!setupFailure};results.push(result);
  if(out){
   const dest=join(out,name);mkdirSync(dest,{recursive:false});
   // Copy only the actual changed blobs and all test/source inputs; no dependency payload.
   for(const folder of ['src','bin','test/eco','schemas'])cpSync(join(dir,folder),join(dest,'source',folder),{recursive:true});
   writeFileSync(join(dest,'stdout.tap'),run.stdout);writeFileSync(join(dest,'stderr.txt'),run.stderr);
   writeFileSync(join(dest,'child.json'),JSON.stringify({...result,node:process.version,args,edits,dependencies:'pinned existing node_modules symlink; no install or provider calls',changedBlobs:edits.map(([file])=>({file,sha256:createHash('sha256').update(readFileSync(join(dir,file))).digest('hex')}))},null,2)+'\n');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
}
process.stdout.write(JSON.stringify({mutations:results},null,2)+'\n');if(results.some(r=>!r.killed))process.exitCode=1;
