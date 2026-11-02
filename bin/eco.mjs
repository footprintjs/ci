#!/usr/bin/env node
import {open,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createEcoReader} from '../src/eco/github-reader.mjs';
import {runEcoStatus,explainEcoRecord} from '../src/eco/status-flow.mjs';
const refuse=code=>{const e=new Error(code);e.code=code;throw e;};
const SHA=/^[a-f0-9]{40}$/,DIGEST=/^[a-f0-9]{64}$/;
const positive=s=>typeof s==='string'&&/^[1-9][0-9]{0,15}$/.test(s)&&Number.isSafeInteger(Number(s));
export function parseEcoArguments(args){
 if(!Array.isArray(args)||args.length>32||args.some(s=>typeof s!=='string'||!s||s.length>4096))refuse('eco-arguments');
 const command=args[0]??'status';if(!['status','explain'].includes(command))refuse('eco-arguments');
 const allowed=command==='status'?['--repo','--pr','--action','--policy-commit','--policy-sha256','--owner-id','--output']:['--record','--key'];const options={};
 for(let i=1;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!allowed.includes(flag)||Object.hasOwn(options,flag)||typeof value!=='string'||value.startsWith('--'))refuse('eco-arguments');options[flag]=value;}
 if(command==='explain'){
  if(!options['--record']||!options['--key']||!/^(observe|admit|diff|report)(Facts|Decision|Sources)$/.test(options['--key']))refuse('eco-arguments');
  return {command,record:options['--record'],key:options['--key']};
 }
 const repository=options['--repo'],pull=options['--pr'],action=options['--action']??'merge-source';
 if((repository!==undefined||pull!==undefined)&&(!/^footprintjs\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(repository??'')||!positive(pull)))refuse('eco-arguments');
 if(!['merge-source','release','policy'].includes(action))refuse('eco-arguments');
 const pins=['--policy-commit','--policy-sha256','--owner-id'],present=pins.filter(p=>Object.hasOwn(options,p));
 if(present.length&&(present.length!==3||!SHA.test(options[pins[0]])||!DIGEST.test(options[pins[1]])||!positive(options[pins[2]])))refuse('eco-arguments');
 return {command,target:repository?{repository,pullNumber:Number(pull),action}:undefined,anchor:present.length?{repository:'footprintjs/ci',commit:options[pins[0]],bodySha256:options[pins[1]],ownerId:Number(options[pins[2]])}:null,output:options['--output']};
}
async function savedRecord(path){
 let handle;try{
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await handle.stat();if(!stat.isFile()||stat.size>1024*1024)refuse('eco-record-invalid');
  const bytes=Buffer.alloc(1024*1024+1);let offset=0;
  while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,null);if(!r.bytesRead)break;offset+=r.bytesRead;}
  if(offset>1024*1024)refuse('eco-record-invalid');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,offset)));
 }catch{refuse('eco-record-invalid');}finally{await handle?.close();}
}
async function save(output,result){
 // Fresh exclusive directory only. Existing evidence is never overwritten.
 try{await mkdir(output,{mode:0o700});}catch(error){refuse(error?.code==='EEXIST'?'eco-output-exists':'eco-output-failed');}
 const record=JSON.stringify(result.record)+'\n',report=JSON.stringify(result.report)+'\n';
 const manifest=JSON.stringify({format:'eco-status-evidence-v1',recordSha256:createHash('sha256').update(record).digest('hex'),reportSha256:createHash('sha256').update(report).digest('hex'),readOnly:true,authorized:false})+'\n';
 for(const [name,bytes] of [['record.json',record],['report.json',report],['manifest.json',manifest]]){
  if(Buffer.byteLength(bytes)>1024*1024)refuse('eco-output-failed');let handle;
  try{handle=await open(join(output,name),'wx',0o600);await handle.writeFile(bytes);}catch{refuse('eco-output-failed');}finally{await handle?.close();}
 }
}
/** Local artifact writes only. No commands for merge/publish/configuration exist. */
export async function main(args=process.argv.slice(2),{stdout=s=>process.stdout.write(s),stderr=s=>process.stderr.write(s),fetcher=globalThis.fetch,env=process.env}={}){
 try{
  const options=parseEcoArguments(args);
  if(options.command==='explain'){
   const explanation=explainEcoRecord(await savedRecord(options.record),options.key);stdout(explanation+'\n');return /^(Incomplete|Unreadable|Unsupported)/.test(explanation)?1:0;
  }
  const result=await runEcoStatus({target:options.target,anchor:options.anchor,reader:createEcoReader({fetcher,githubToken:env.GH_TOKEN||undefined})});
  if(options.output)await save(options.output,result);stdout(JSON.stringify({...result.report,evidenceSaved:!!options.output})+'\n');
  return result.status==='known'?0:result.status==='held'?1:result.status==='unknown'?2:3;
 }catch(error){const codes=new Set(['eco-arguments','eco-record-invalid','eco-output-exists','eco-output-failed']);stderr(JSON.stringify({status:'unknown',reason:codes.has(error?.code)?error.code:'eco-failed',executedWrites:0,authorized:false})+'\n');return 1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().then(code=>{process.exitCode=code;});
