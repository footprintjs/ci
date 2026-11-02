import {createHash} from 'node:crypto';
import {jsonData,fields,text,id,array,parseLedgerText} from './json-data.mjs';
import {isEcoReader} from './github-reader.mjs';
import {foldVerdictObservations} from './verdict-history.mjs';
import {bindPriorPolicy} from './prior-policy.mjs';
import {validateVersions,validateWork} from './ledger-schema.mjs';
const SHA=/^[a-f0-9]{40}$/;
const snapshots=new WeakMap(),policies=new WeakMap(),ledgers=new WeakSet();
const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const readFailures=new Set(['eco-request-limit','eco-response-limit','eco-transport','eco-redirect','eco-http','eco-body','eco-json']);
function targetData(raw){
 const t=jsonData(raw,4096);fields(t,['repository','pullNumber','action']);text(t.repository,/^footprintjs\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/);id(t.pullNumber);
 if(!['merge-source','release','policy'].includes(t.action))refuse('eco-snapshot-invalid');return t;
}
function pullData(p,t,repoId){
 if(p.number!==t.pullNumber||p.base?.ref!=='main'||p.base?.repo?.id!==repoId||p.base.repo.full_name!==t.repository)refuse('eco-snapshot-invalid');
 for(const v of [p.head?.sha,p.base?.sha])text(v,SHA,40);id(p.head.repo.id);
 if(!['open','closed'].includes(p.state))refuse('eco-snapshot-invalid');
 return {head:p.head.sha,base:p.base.sha,open:p.state==='open',sameRepository:p.head.repo.id===repoId&&p.head.repo.full_name===t.repository};
}
async function pages(reader,target,resource,sha){
 const rows=[],ids=new Set();let total=null;
 for(let page=1;page<=8;page++){
  const {data,observation}=await reader.read({resource,repository:target.repository,...(resource==='comments'?{pullNumber:target.pullNumber}:{sha}),page});
  const items=resource==='comments'?data:data.check_runs;array(items,100);
  if(resource==='checks'){
   if(!Number.isSafeInteger(data.total_count)||data.total_count<0||data.total_count>512||(total!==null&&data.total_count!==total))refuse('eco-snapshot-invalid');total=data.total_count;
  }
  for(const row of items){id(row.id);if(ids.has(row.id)||rows.length>=512)refuse('eco-snapshot-invalid');ids.add(row.id);rows.push(row);}
  // Probe an exact full last page rather than silently assuming it is the end.
  if(!observation.hasNext&&items.length<100){if(total!==null&&rows.length!==total)refuse('eco-snapshot-invalid');return rows;}
 }
 refuse('eco-snapshot-invalid');
}
/** Current pages are a snapshot, never a complete creation/edit/deletion history.
 * The WeakMap binds this run's snapshot to its reader; it does not authenticate
 * injected fetchers or prove remote history. No raw body enters returned facts.
 */
export async function collectSnapshot({reader,target}){
 if(!isEcoReader(reader))refuse('eco-reader-unbound');
 try{
  const t=targetData(target),get=async resource=>(await reader.read({...resource,repository:t.repository})).data;
  const repo=await get({resource:'repository'});id(repo.id);if(repo.full_name!==t.repository)refuse('eco-snapshot-invalid');
  const first=pullData(await get({resource:'pull',pullNumber:t.pullNumber}),t,repo.id);
  const main=await get({resource:'main'});if(main.ref!=='refs/heads/main'||main.object?.type!=='commit')refuse('eco-snapshot-invalid');text(main.object.sha,SHA,40);
  const commit=await get({resource:'commit',sha:first.head});if(commit.sha!==first.head)refuse('eco-snapshot-invalid');text(commit.tree?.sha,SHA,40);
  const comments=await pages(reader,t,'comments');
  let previousId=0;const events=comments.map((c,index)=>{
   id(c.user?.id);if(c.id<=previousId||typeof c.body!=='string'||Buffer.byteLength(c.body)>65536)refuse('eco-snapshot-invalid');previousId=c.id;
   return {sequence:index+1,providerId:String(c.id),kind:'comment-seen',id:c.id,authorId:c.user.id,body:c.body};
  });
  const receipt=foldVerdictObservations(null,{schemaVersion:1,repositoryId:repo.id,pullNumber:t.pullNumber,fromSequence:1,continuous:false,events});
  const checks=(await pages(reader,t,'checks',first.head)).map(c=>{
   text(c.name,/^[^\x00-\x1f\x7f]+$/,128);id(c.app?.id);text(c.head_sha,SHA,40);
   if(c.head_sha!==first.head||!['queued','in_progress','completed','waiting','pending','requested'].includes(c.status)||!(c.conclusion===null||['action_required','cancelled','failure','neutral','success','skipped','stale','timed_out','startup_failure'].includes(c.conclusion)))refuse('eco-snapshot-invalid');
   return {id:c.id,name:c.name,appId:c.app.id,head:c.head_sha,status:c.status,conclusion:c.conclusion};
  });
  const last=pullData(await get({resource:'pull',pullNumber:t.pullNumber}),t,repo.id),lastMain=await get({resource:'main'});
  const stable=JSON.stringify(first)===JSON.stringify(last)&&first.base===main.object.sha&&lastMain.ref==='refs/heads/main'&&lastMain.object?.type==='commit'&&lastMain.object.sha===main.object.sha;
  const facts=jsonData({...t,repositoryId:repo.id,head:first.head,base:first.base,tree:commit.tree.sha,stable,open:last.open,sameRepository:first.sameRepository,historyComplete:false,commentCount:comments.length,checkCount:checks.length});
  const result=Object.freeze({facts,receipt,checks:jsonData(checks)});snapshots.set(result,reader);return result;
 }catch(error){if(readFailures.has(error?.code))throw error;refuse('eco-snapshot-invalid');}
}
export const isCollectedSnapshot=snapshot=>snapshots.has(snapshot);
/** Separately supplied numeric owner/body/commit pins bind policy observed at
 * PRIOR main. Candidate policy is never read as its own authority. No seed/write.
 */
export async function collectPriorPolicy({reader,anchor,snapshot}){
 if(!snapshots.has(snapshot)||snapshots.get(snapshot)!==reader)refuse('eco-snapshot-unbound');
 if(anchor===null||anchor===undefined)refuse('policy-unanchored');
 try{
  const a=jsonData(anchor,4096);fields(a,['repository','commit','bodySha256','ownerId']);text(a.commit,SHA,40);id(a.ownerId);text(a.bodySha256,/^[a-f0-9]{64}$/,64);if(a.repository!=='footprintjs/ci')refuse('policy-stale');
  const get=async spec=>(await reader.read({repository:'footprintjs/ci',...spec})).data;
  const main=await get({resource:'main'});if(main.ref!=='refs/heads/main'||main.object?.type!=='commit')refuse('policy-stale');text(main.object.sha,SHA,40);
  const current=main.object.sha,comparison=await get({resource:'compare',anchor:a.commit,sha:current});
  if(!['identical','ahead'].includes(comparison.status)||comparison.base_commit?.sha!==a.commit||comparison.merge_base_commit?.sha!==a.commit)refuse('policy-stale');
  const body=await readLedgerBody(reader,'policy',current),f=snapshot.facts;
  const final=await get({resource:'main'});if(final.ref!=='refs/heads/main'||final.object?.sha!==current)refuse('policy-stale');
  const context=bindPriorPolicy(body,a,{repository:'footprintjs/ci',ref:'refs/heads/main',commit:current,anchorCommit:a.commit,anchorAncestor:true,candidateRepository:f.repository,candidateHead:f.head,candidateBase:f.base});
  policies.set(context,{reader,snapshot});return context;
 }catch(error){if(readFailures.has(error?.code))throw error;refuse('policy-stale');}
}

async function readLedgerBody(reader,name,commit){
 const {data:file}=await reader.read({repository:'footprintjs/ci',resource:'ledger',name,sha:commit});
 if(file.type!=='file'||file.path!=='ledger/'+name+'.json'||file.encoding!=='base64'||typeof file.content!=='string'||!Number.isSafeInteger(file.size)||file.size<1||file.size>1024*1024)refuse('ledger-unavailable');
 const encoded=file.content.replace(/\n/g,'');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))refuse('ledger-unavailable');
 const bytes=Buffer.from(encoded,'base64');if(bytes.length!==file.size||bytes.toString('base64')!==encoded||createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==file.sha)refuse('ledger-unavailable');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
/** Observed bytes are validated desired state, not facts or execution authority. */
export async function collectLedgerState({reader,snapshot,context}){
 const bound=policies.get(context);if(!bound||bound.reader!==reader||bound.snapshot!==snapshot)refuse('ledger-unavailable');
 try{
  const commit=context.observation.commit;
  const versions=validateVersions(parseLedgerText(await readLedgerBody(reader,'versions',commit)));
  const work=validateWork(parseLedgerText(await readLedgerBody(reader,'work',commit)));
  const {data:main}=await reader.read({repository:'footprintjs/ci',resource:'main'});
  if(main.ref!=='refs/heads/main'||main.object?.type!=='commit'||main.object.sha!==commit)refuse('ledger-unavailable');
  const result=Object.freeze({versions,work});ledgers.add(result);return result;
 }catch{refuse('ledger-unavailable');}
}
export const isCollectedLedger=value=>ledgers.has(value);
