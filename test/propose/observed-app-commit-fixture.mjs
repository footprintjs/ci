import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bootstrapFixture} from './bootstrap-provider-fixture.mjs';
import {runFoottraceProposeInspection} from '../../src/propose/foottrace-inspection.mjs';
import {createFoottraceProposerReader} from '../../src/propose/current-proposer.mjs';
import {createFoottracePendingObservationReader} from '../../src/propose/foottrace-pending.mjs';
export const PRIVATE='PRIVATE-SIGNED-COMMIT-BODY';
export async function observedCommitFixture({sameTree=true,change=()=>{},changeIdentity=()=>{}}={}) {
 const f=await bootstrapFixture(),inspection=await runFoottraceProposeInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 assert.equal(inspection.status,'inspection-only');
 const prepared=inspection.backend.prepared;
 // Model a separately observed existing App ref; no historical producer is
 // attributed to it and no fixture/provider write call is performed.
 let head=f.P;
 if(sameTree){
  const target=new Map(f.f.trees.get(prepared.sourceTree));
  for(const [path,text] of Object.entries(prepared.prepared.updates)){
   const bytes=Buffer.from(text);const prep=await import('../../src/guards/release-prepare.cjs');
   target.set(path,{bytes,mode:'100644',sha:prep.default.gitObject('blob',bytes)});
  }
  for(const path of prepared.prepared.deletions)target.delete(path);
  head=f.f.addCommit(target,[f.M,f.P]);f.f.tip=head;f.pending.head.sha=head;
 }
 const pending=await createFoottracePendingObservationReader({api:f.port.api,context:f.context,settings:{slug:f.port.settings.slug}})();
 assert.equal(pending.valid,true);
 const nativeCurrent=createFoottraceProposerReader({transport:f.transport,context:f.fullContext});
 const current=await nativeCurrent(prepared);assert.equal(current.valid,true);
 const calls=[],identityCalls=[],api=async(method,route,body)=>{
  assert.equal(method,'GET');assert.equal(body,undefined);calls.push(route);
  assert.equal(route,'/repos/footprintjs/foottrace/commits/'+head);
  const c=f.f.commits.get(head);
  const raw={sha:head,parents:structuredClone(c.parents),author:{...f.f.bot},committer:{...f.f.bot},
   commit:{tree:structuredClone(c.tree),author:{name:PRIVATE,email:PRIVATE},committer:{name:PRIVATE,email:PRIVATE},
    message:PRIVATE,verification:{verified:true,reason:'valid',signature:PRIVATE,payload:PRIVATE}},private:PRIVATE};
  change(raw,calls.length);return {data:raw};
 };
 const readCurrentProposer=async value=>{
  identityCalls.push(value.sourceSha);const v=structuredClone(await nativeCurrent(value));changeIdentity(v,identityCalls.length);v.digest=createHash('sha256').update(JSON.stringify(v.identity)).digest('hex');return v;
 };
 return {...f,prepared,pending,current,head,api,readCurrentProposer,identityCalls,commitCalls:calls};
}
