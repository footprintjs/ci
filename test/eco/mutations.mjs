// Isolated deliberate breaks. Never mutate working source or contact providers.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cases=[
 ['body-byte-bound','src/eco/verdict-comment.mjs',"Buffer.byteLength(body,'utf8') > 64 * 1024",'false'],
 ['duplicate-inline-field','src/eco/verdict-comment.mjs','values.has(key)','false'],
 ['scope-byte-bound','src/eco/verdict-comment.mjs',"Buffer.byteLength(values.get('Scope'),'utf8') > 1024",'false'],
 ['no-force-required','src/eco/ledger-schema.mjs','p.noForce!==true','false'],
 ['retained-hold','src/eco/ledger-schema.mjs','if(!r.held&&r.holds.length)invalid();','if(false)invalid();'],
 ['delete-later-refusal','src/eco/verdict-history.mjs','existing.deleted=true;','state.entries=state.entries.filter(x=>x.id!==event.id);'],
 ['body-edit-invalidation','src/eco/verdict-history.mjs','existing.changed=true;','existing.changed=false;'],
 ['creation-after-push','src/eco/verdict-history.mjs','x.createdSequence>state.push.sequence','true'],
 ['unknown-coverage','src/eco/verdict-history.mjs','||!state.continuous','||false'],
 ['receipt-digest','src/eco/verdict-history.mjs','if(digest(prior)!==expectedPreviousDigest)invalid();','if(false)invalid();'],
 ['owner-principal','src/eco/verdict-history.mjs','x.authorId===ownerId&&',''],
 ['prior-owner-pin','src/eco/prior-policy.mjs','if(policy.ownerId!==anchor.ownerId)','if(false)'],
 ['prior-policy-shape','src/eco/prior-policy.mjs','if(!isValidatedPolicy(policy))','if(false)'],
];
const results=[];
for(const [name,file,from,to] of cases){
 const dir=mkdtempSync(join(tmpdir(),'eco-mutation-'));
 try{
  for(const folder of ['src/eco','test/eco','schemas'])cpSync(join(root,folder),join(dir,folder),{recursive:true});
  const path=join(dir,file),source=readFileSync(path,'utf8');if(source.split(from).length!==2)throw Error('mutation-target-not-unique:'+name);
  writeFileSync(path,source.replace(from,to));
  const run=spawnSync(process.execPath,['--test','test/eco/ledger-schema.test.mjs','test/eco/verdict-comment.test.mjs','test/eco/verdict-history.test.mjs','test/eco/prior-policy.test.mjs'],{cwd:dir,encoding:'utf8',timeout:30000});
  if(run.error)throw run.error;const output=run.stdout+'\n'+run.stderr;
  const assertionFailure=/ERR_ASSERTION|AssertionError/.test(output),setupFailure=/ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|ReferenceError/.test(output);
  results.push({name,killed:run.status!==0&&assertionFailure&&!setupFailure,status:run.status,assertionFailure,setupFailure});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
process.stdout.write(JSON.stringify({mutations:results},null,2)+'\n');
if(results.some(x=>!x.killed))process.exitCode=1;
