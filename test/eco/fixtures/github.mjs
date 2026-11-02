import {createHash} from 'node:crypto';
import {createEcoReader} from '../../../src/eco/github-reader.mjs';
const head='a'.repeat(40),base='b'.repeat(40),tree='c'.repeat(40),prior='d'.repeat(40);
const target={repository:'footprintjs/ci',pullNumber:2,action:'merge-source'};
const verdict='<!-- footprint-verdict v1 -->\nReviewer: Claude\nVerdict: merge\nAction: merge-source\nHead: '+head+'\nBase: '+base+'\nTree: '+tree+'\nScope: secret body /Users/private';
const policy={schemaVersion:1,ownerId:7,releasesPaused:true,verdictRequired:true,noForce:true,repositories:[{id:1,repository:'footprintjs/ci',package:'@footprintjs/release-flow',held:true,holds:[{kind:'owner',ref:'e'.repeat(64)}],approvalProfile:'structured-owner-comment',actions:['merge-source','policy'],gates:[{name:'check',appId:15368}]}]};
const body=JSON.stringify(policy);const blob=Buffer.from(body);const sha=createHash('sha1').update('blob '+blob.length+'\0').update(blob).digest('hex');
const anchor={repository:'footprintjs/ci',commit:prior,bodySha256:createHash('sha256').update(body).digest('hex'),ownerId:7};
const rawPull=()=>({number:2,state:'open',head:{sha:head,repo:{id:1,full_name:'footprintjs/ci'}},base:{sha:base,ref:'main',repo:{id:1,full_name:'footprintjs/ci'}}});
function fixture(override=()=>undefined){const calls=[];let pulls=0;const fetcher=async(url)=>{const u=new URL(url);calls.push(u.pathname+u.search);let data=override(u,++pulls);if(data===undefined){
 if(u.pathname.endsWith('/pulls/2'))data=rawPull();
 else if(u.pathname.endsWith('/git/ref/heads/main'))data={ref:'refs/heads/main',object:{type:'commit',sha:base}};
 else if(u.pathname.endsWith('/git/commits/'+head))data={sha:head,tree:{sha:tree}};
 else if(u.pathname.includes('/issues/2/comments'))data=[{id:100,user:{id:7},body:verdict}];
 else if(u.pathname.includes('/check-runs'))data={total_count:1,check_runs:[{id:10,name:'check',app:{id:15368},head_sha:head,status:'completed',conclusion:'success'}]};
 else if(u.pathname.includes('/compare/'))data={status:'ahead',base_commit:{sha:prior},merge_base_commit:{sha:prior}};
 else if(u.pathname.endsWith('/contents/ledger/versions.json')||u.pathname.endsWith('/contents/ledger/work.json')){const name=u.pathname.endsWith('/versions.json')?'versions':'work';const b=Buffer.from(JSON.stringify({schemaVersion:1,items:[]}));data={type:'file',path:'ledger/'+name+'.json',size:b.length,encoding:'base64',content:b.toString('base64'),sha:createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')};}
 else if(u.pathname.includes('/contents/ledger/'))data={type:'file',path:'ledger/policy.json',size:blob.length,sha,encoding:'base64',content:blob.toString('base64')};
 else data={id:1,full_name:'footprintjs/ci'};
 }return new Response(JSON.stringify(data),{status:200});};return {reader:createEcoReader({fetcher}),calls};}

export {fixture,head,base,tree,prior,target,anchor,policy,body,blob,sha,rawPull};

function policyFixture(change,override=()=>undefined){
 const p=structuredClone(policy);change(p);const bytes=Buffer.from(JSON.stringify(p));
 const file={type:'file',path:'ledger/policy.json',size:bytes.length,encoding:'base64',content:bytes.toString('base64'),sha:createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')};
 return {...fixture(u=>override(u)??(u.pathname.endsWith('/contents/ledger/policy.json')?file:undefined)),anchor:{...anchor,bodySha256:createHash('sha256').update(bytes).digest('hex')}};
}
export {policyFixture};
