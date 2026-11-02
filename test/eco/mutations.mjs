// Isolated deliberate breaks. Never mutate working source or contact providers.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const evidence=process.env.ECO_MUTATION_EVIDENCE;
if(evidence)mkdirSync(evidence,{recursive:true});
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
cases.push(
 ['H1-unseen-coverage','src/eco/verdict-history.mjs',"if(event.kind==='comment-seen')state.continuous=false;",''],
 ['H1-receipt-coverage','src/eco/verdict-history.mjs',"if(prior.continuous&&e.createdSequence===null&&(!prior.push||e.firstObservedSequence>prior.push.sequence))invalid();",''],
 ['H2-envelope-first-position','src/eco/verdict-history.mjs',"if(batch.events.length&&batch.events[0]?.sequence!==batch.fromSequence)invalid();",''],
 ['B1-cumulative-budget','src/eco/json-data.mjs','remaining-=bytes;',''],
 ['B1-escaped-string-budget','src/eco/json-data.mjs','else if(c<32)spend(6);','else if(c<32)spend(1);'],
 ['B1-key-budget','src/eco/json-data.mjs','string(key);const d=','const d='],
 ['B1-repeated-string-budget','src/eco/json-data.mjs',"if(typeof value==='string'){string(value);return value;}","if(typeof value==='string'){return value;}"],
);
const results=[];
for(const [name,file,from,to] of cases){
 const dir=mkdtempSync(join(tmpdir(),'eco-mutation-'));
 try{
  for(const folder of ['src/eco','test/eco','schemas'])cpSync(join(root,folder),join(dir,folder),{recursive:true});
  const path=join(dir,file),source=readFileSync(path,'utf8');if(source.split(from).length!==2)throw Error('mutation-target-not-unique:'+name);
  writeFileSync(path,source.replace(from,to));
  const run=spawnSync(process.execPath,['--test','test/eco/json-data.test.mjs','test/eco/ledger-schema.test.mjs','test/eco/verdict-comment.test.mjs','test/eco/verdict-history.test.mjs','test/eco/prior-policy.test.mjs'],{cwd:dir,encoding:'utf8',timeout:30000});
  if(run.error)throw run.error;const output=run.stdout+'\n'+run.stderr;
  const assertionFailure=/ERR_ASSERTION|AssertionError/.test(output),setupFailure=/ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|ReferenceError/.test(output);
  if(evidence){
   const saved=join(evidence,name);mkdirSync(saved,{recursive:false});
   cpSync(dir,join(saved,'source'),{recursive:true});
   writeFileSync(join(saved,'stdout.tap'),run.stdout);writeFileSync(join(saved,'stderr.txt'),run.stderr);
   writeFileSync(join(saved,'child.json'),JSON.stringify({name,file,from,to,node:process.version,status:run.status,signal:run.signal,assertionFailure,setupFailure},null,2)+'\n');
  }
  results.push({name,killed:run.status!==0&&assertionFailure&&!setupFailure,status:run.status,assertionFailure,setupFailure});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
process.stdout.write(JSON.stringify({mutations:results},null,2)+'\n');
if(results.some(x=>!x.killed))process.exitCode=1;
