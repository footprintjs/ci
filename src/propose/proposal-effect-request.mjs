import {fields,jsonData,id,array} from '../eco/json-data.mjs';
import control from '../guards/release-control.cjs';
import preparation from '../guards/release-prepare.cjs';
import {bindProposalMetadata} from './proposal-metadata-payload.mjs';
const MiB=1024*1024,fail=()=>{throw new Error('proposal-effect-unavailable');};
const sha=value=>{if(!control.validSha(value))fail();return value;};
function text(value,maximum,empty=false){
 if(typeof value!=='string'||(!empty&&!value.length)||Buffer.byteLength(value)>maximum||
  Buffer.from(value).toString('utf8')!==value)fail();
 return value;
}
function path(value){
 text(value,1024);
 if(/[\u0000-\u001f\u007f\\]/.test(value)||value.split('/').some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'))fail();
 return value;
}
// Typed envelope/scalar admission for native blob content. The shared ledger
// JSON reader's ONE-MiB ceiling is unchanged; no general JSON budget is raised.
function record(raw,names){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  ![Object.prototype,null].includes(Object.getPrototypeOf(raw)))fail();
 const keys=Reflect.ownKeys(raw);
 if(keys.length!==names.length||keys.some(k=>typeof k!=='string'||!names.includes(k)))fail();
 const result=Object.create(null);
 for(const key of names){
  const d=Object.getOwnPropertyDescriptor(raw,key);
  if(!d||!Object.hasOwn(d,'value'))fail();result[key]=d.value;
 }
 return result;
}
/** Closed native request DATA only. No author/signature, arbitrary route, force,
 * auto-merge or publication endpoint. Actual prepared source/tree/profile,
 * current writer/producer, native eligibility and pre-effect commits belong to
 * the owning flow, never this schema or a saved input.
 */
export function bindProposalEffectRequest(repository,input){
 const repo=fields(jsonData(repository),['id','full_name']);id(repo.id);
 if(typeof repo.full_name!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo.full_name))fail();
 const v=record(input,input&&Object.hasOwn(input,'limits')?['effect','payload','limits']:['effect','payload']);
 const bound=Object.hasOwn(v,'limits')?jsonData(v.limits,1024):undefined;
 const prefix='/repos/'+repo.full_name;let method='POST',route,payload,key=v.effect;
 switch(v.effect){
  case 'create-blob':{
   const p=record(v.payload,['content','encoding']);
   if(p.encoding!=='utf-8')fail();
   payload={content:text(p.content,2*MiB,true),encoding:'utf-8'};route=prefix+'/git/blobs';
   key+=':'+preparation.gitObject('blob',Buffer.from(payload.content));break;
  }
  case 'create-tree':{
   const p=fields(jsonData(v.payload),['base_tree','tree']);array(p.tree,4096);if(!p.tree.length)fail();
   const seen=new Set(),entries=p.tree.map(raw=>{
    const row=fields(raw,['path','mode','type','sha']),name=path(row.path);
    if(seen.has(name)||!['100644','100755'].includes(row.mode)||row.type!=='blob')fail();seen.add(name);
    return {path:name,mode:row.mode,type:'blob',sha:row.sha===null?null:sha(row.sha)};
   });
   entries.sort((a,b)=>Buffer.compare(Buffer.from(a.path),Buffer.from(b.path)));
   payload={base_tree:sha(p.base_tree),tree:entries};route=prefix+'/git/trees';break;
  }
  case 'create-commit':{
   const p=fields(jsonData(v.payload),['message','tree','parents']);array(p.parents,2);
   if(p.parents.length!==2||new Set(p.parents).size!==2)fail();
   payload={message:text(p.message,4096),tree:sha(p.tree),parents:p.parents.map(sha)};route=prefix+'/git/commits';break;
  }
  case 'move-ref':{
   const p=fields(jsonData(v.payload),['sha','force']);if(p.force!==false)fail();
   method='PATCH';payload={sha:sha(p.sha),force:false};route=prefix+'/git/refs/heads/release/next';break;
  }
  case 'create-pr':{
   const p=fields(jsonData(v.payload),['title','head','base','body']);
   if(p.head!=='release/next'||p.base!=='main')fail();
   const m=bindProposalMetadata({title:p.title,body:p.body},true);
   payload={title:m.title,head:'release/next',base:'main',body:m.body};route=prefix+'/pulls';break;
  }
  default:fail();
 }
 const body=JSON.stringify(payload);if(Buffer.byteLength(body)>4*MiB)fail();
 return Object.freeze({effect:v.effect,key,method,route,url:'https://api.github.com'+route,payload,body,
  successStatus:v.effect==='move-ref'?200:201,
  binding:{effect:v.effect,payload,...(bound===undefined?{}:{limits:bound})}});
}
