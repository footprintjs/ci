import assert from 'node:assert/strict';
import preparation from '../../src/guards/release-prepare.cjs';
import native from '../../src/guards/release-github.cjs';
import {bootstrapFixture} from './bootstrap-provider-fixture.mjs';
import {nativeHttpFixture} from './native-http-provider-fixture.mjs';
export const PRIVATE='PRIVATE-CURRENT-METADATA-PROVIDER';
/** Existing signed ref is a modelled provider observation; no original creator
 * is selected or current producer status rewritten to make this fixture work. */
export async function metadataInputFixture({sameTree=true,useOriginalHead=false,pendingParent='current',changeCommit=()=>{},reviewStates=[],changeReview=()=>{},changeHttp=()=>{},metadata='exact',changeMetadata=()=>{},...options}={}) {
 const f=await bootstrapFixture({...options,changeHttp});let head=f.P;
 if(sameTree&&!useOriginalHead){
  const inventory=new Map(f.f.trees.get(f.current.commit.tree.sha));
  for(const [path,text] of Object.entries(f.currentPrepared.updates)){
   const bytes=Buffer.from(text);inventory.set(path,{bytes,mode:'100644',sha:preparation.gitObject('blob',bytes)});
  }
  for(const path of f.currentPrepared.deletions)inventory.delete(path);
  head=f.f.addCommit(inventory,[pendingParent==='original'?f.B:f.M,f.P]);f.f.tip=head;f.pending.head.sha=head;
 }
 const calls=[],reviews=[];let commitReads=0,reviewReads=0,permissionReads=0,metadataReads=0;
 const addReview=state=>reviews.push({id:100+reviews.length,state,commit_id:head,user:{id:42,type:'User',login:'reviewer42'},body:PRIVATE});
 for(const state of reviewStates)addReview(state);
 const api=async(method,route,body)=>{
  assert.equal(method,'GET');calls.push(route);
  if(route==='/repos/footprintjs/foottrace/commits/'+head){
   const c=f.f.commits.get(head),data={sha:head,parents:structuredClone(c.parents),author:{...f.f.bot},committer:{...f.f.bot},
    commit:{tree:structuredClone(c.tree),verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE},message:PRIVATE},private:PRIVATE};
   changeCommit(data,++commitReads);return {data};
  }
  if(route.includes('/pulls/101/reviews?')){
   reviewReads++;const page=Number(new URL('https://fixture.invalid'+route).searchParams.get('page'));
   const data=structuredClone(reviews.slice((page-1)*100,page*100));
   changeReview(data,route,{reviewReads,permissionReads});return {data};
  }
  if(route.includes('/collaborators/')){
   permissionReads++;const data={permission:'write',user:{id:42,type:'User',login:'reviewer42'},private:PRIVATE};
   changeReview(data,route,{reviewReads,permissionReads});return {data};
  }
  if(route==='/repos/footprintjs/foottrace/pulls/101'){
   const response=await f.api(method,route,body),expected=native.proposalMetadata(f.currentPrepared.version,f.currentPrepared.notes);
   const actual=metadata==='exact'?expected:metadata==='stale'?{title:'Stale release',body:'Stale notes'}:metadata;
   response.data.title=actual.title;response.data.body=actual.body;changeMetadata(response.data,++metadataReads);return response;
  }
  return f.api(method,route,body);
 };
 const http=nativeHttpFixture({model:f.f,api,change:changeHttp});
 return {...f,...http,calls,head,addReview};
}
