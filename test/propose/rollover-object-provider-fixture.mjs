import {rolloverFixture} from './rollover-provider-fixture.mjs';
import {nativeHttpFixture} from './native-http-provider-fixture.mjs';
import preparation from '../../src/guards/release-prepare.cjs';
export const PRIVATE='PRIVATE-ORDINARY-SIGNED-OBJECT';
/** Independent synthetic signed Git object BEFORE production observation. The
 * release ref stays at actual published L; no commit/ref/PR effect is submitted.
 */
export async function rolloverObjectFixture({edit=()=>{},...options}={}){
 const f=await rolloverFixture(options),inventory=new Map(f.f.trees.get(f.prepared.sourceTree));
 for(const [path,text] of Object.entries(f.prepared.prepared.updates)){
  const bytes=Buffer.from(text);inventory.set(path,{bytes,mode:'100644',sha:preparation.gitObject('blob',bytes)});
 }
 for(const path of f.prepared.prepared.deletions)inventory.delete(path);
 const objectHead=f.f.addCommit(inventory,[f.M,f.f.originalHead]);let objectReads=0;
 const api=async(method,path,body)=>{
  if(path==='/repos/footprintjs/foottrace/commits/'+objectHead){
   const c=f.f.commits.get(objectHead),data={sha:objectHead,parents:structuredClone(c.parents),
    author:{...f.f.bot},committer:{...f.f.bot},commit:{tree:structuredClone(c.tree),
     verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE}}};
   edit(data,++objectReads,f);return {data};
  }
  return f.api(method,path,body);
 };
 const http=nativeHttpFixture({model:f.f,api,change:options.changeHttp});
 return {...f,...http,prepared:f.prepared,objectHead,objectReads:()=>objectReads};
}
