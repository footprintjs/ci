import {isDeepStrictEqual} from 'node:util';
import preparation from '../guards/release-prepare.cjs';
import control from '../guards/release-control.cjs';
import {jsonData} from '../eco/json-data.mjs';
import {createFoottracePreparationProfile} from './foottrace-profile.mjs';
import {bindProposalEffectRequest} from './proposal-effect-request.mjs';
import {own} from './source-inventory.mjs';
const fail=()=>{throw new Error('proposal-object-plan-unavailable');};
const profile=createFoottracePreparationProfile();
const sha=v=>{if(!control.validSha(v))fail();return v;};
const same=(a,b)=>isDeepStrictEqual(jsonData(a),jsonData(b));
// Existing pending DTO has NO authority field; ordinary INPUT explicitly has
// authorized:false. Preserve both native DTOs without adding/coercing grants.
function input(repository,p,scope){
 if(own(repository,'full_name')!=='footprintjs/foottrace'||own(p,'valid')!==true||own(p,'scope')!==scope||
  own(p,'profileId')!==profile.id||own(p,'authorized')!==(scope==='current-prepared-inputs-only'?false:undefined)||own(own(p,'prepared'),'package')!==profile.packageName||
  own(own(p,'prepared'),'version')!==own(p,'version'))fail();
 for(const key of ['sourceSha','sourceTree','targetTree'])sha(own(p,key));
}
/** Fixed CODE roles over INPUT only. This plans no ref/PR/publication and grants
 * neither target-tree validity, native history nor mutation permission.
 */
export function createFoottracePendingObjectPlan({repository,prepared:p}={}){
 input(repository,p,'refresh-prepared-inputs-only');
 const parents=[p.sourceSha,sha(own(p,'pendingSha'))];
 if(!same(own(p,'proposedParents'),parents))fail();
 return createPlan(repository,p,parents);
}
export function createFoottraceRolloverObjectPlan({repository,prepared:p,rollover}={}){
 input(repository,p,'current-prepared-inputs-only');
 if(own(p,'packageName')!==profile.packageName||own(p,'pendingSha')!==undefined||own(p,'preparationRefs')!==undefined||
  own(rollover,'valid')!==true||own(rollover,'scope')!=='closed-published-rollover-inputs-only'||own(rollover,'authorized')!==false)fail();
 const r=own(rollover,'reference');
 if(own(r,'repositoryId')!==repository.id||['sourceSha','sourceTree','targetTree','fromVersion','version','preparationDate'].some(key=>own(r,key)!==own(p,key)))fail();
 const head=sha(own(own(r,'predecessor'),'head')),parents=[p.sourceSha,head];
 if(own(r,'retainedHeadSha')!==head||!same(own(r,'nextParents'),parents))fail();
 return createPlan(repository,p,parents);
}
function freeze(value){
 if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
 return value;
}
// Extracted ONCE from the existing native pending object phase. Both roles use
// identical content addressing, deduplication, tree inventory and closed schema.
function createPlan(repository,p,parents){
 const blobs=new Map(),entries=[];
 for(const [path,content] of Object.entries(p.prepared.updates)){
  const spec=bindProposalEffectRequest(repository,{effect:'create-blob',payload:{content,encoding:'utf-8'}});
  const oid=preparation.gitObject('blob',Buffer.from(spec.payload.content));
  if(blobs.has(oid)&&blobs.get(oid).payload.content!==content)fail();
  blobs.set(oid,{effect:'create-blob',payload:spec.payload,expected:oid});
  entries.push({path,mode:'100644',type:'blob',sha:oid});
 }
 for(const path of p.prepared.deletions)entries.push({path,mode:'100644',type:'blob',sha:null});
 const rows=[...blobs.values(),
  {effect:'create-tree',payload:{base_tree:p.sourceTree,tree:entries},expected:p.targetTree},
  {effect:'create-commit',payload:{message:'chore: release '+p.version,tree:p.targetTree,parents},expected:null}];
 return freeze(rows.map(row=>({...row,spec:bindProposalEffectRequest(repository,{effect:row.effect,payload:row.payload})})));
}
