import {isCollectedSnapshot,isCollectedLedger} from './collector.mjs';
import {isBoundPriorPolicy,priorProfile} from './prior-policy.mjs';
import {observedVerdictFinding} from './verdict-history.mjs';
import {jsonData} from './json-data.mjs';
const policyReasons=new Set(['policy-unanchored','policy-stale','policy-repository-missing','policy-unavailable']);
/** Conditional read-only diff facts. All routing of their outcomes is performed
 * by the native status flow's decide nodes. Never an effect grant. */
export function statusFindings(snapshot,context,admissionCode,ledger=null){
 const findings=[],holds=[];
 if(!isCollectedSnapshot(snapshot))return jsonData({findings:['observation-unavailable',policyReasons.has(admissionCode)?admissionCode:'policy-unavailable','verdict-missing'],holds:[]});
 const f=snapshot.facts;
 if(!f.stable)findings.push('snapshot-stale');
 if(!f.open)holds.push('pull-closed');
 if(!f.sameRepository)findings.push('fork-head-unbound');
 let profile;
 if(!isBoundPriorPolicy(context))findings.push(policyReasons.has(admissionCode)?admissionCode:'policy-unavailable');
 else{
  if(!isCollectedLedger(ledger))findings.push('ledger-unavailable');
  else{const desired=ledger.versions.items.find(r=>r.repository===f.repository);if(desired?.candidate&&desired.candidate.head!==f.head)findings.push('candidate-stale');}
  try{profile=priorProfile(context,f.repositoryId,f.repository);}catch{findings.push('policy-repository-missing');}
  if(profile){
   if(profile.approvalProfile==='foottrace-disclosed-user')findings.push('native-approval-unobserved');
   if(profile.held||profile.holds.length)holds.push('repo-held');
   if(!profile.actions.includes(f.action))holds.push('action-not-allowed');
   if(f.action==='release'&&context.policy.releasesPaused)holds.push('release-paused');
   for(const gate of profile.gates){
    const latest=snapshot.checks.filter(c=>c.name===gate.name&&c.appId===gate.appId).sort((a,b)=>b.id-a.id)[0];
    if(!latest)findings.push('checks-missing');
    else if(latest.head!==f.head||latest.status!=='completed'||latest.conclusion!=='success')holds.push('checks-not-green');
   }
  }
 }
 // The REST snapshot adapter never supplies provider creation-after-push history.
 // Native profile/approval and later archive/OIDC/effect guards are not substituted.
 const verdict=isBoundPriorPolicy(context)?observedVerdictFinding(snapshot.receipt.state,{repositoryId:f.repositoryId,pullNumber:f.pullNumber,ownerId:context.policy.ownerId,head:f.head,base:f.base,tree:f.tree,action:f.action}).code:'verdict-missing';
 if(verdict!=='verdict-metadata-matched')findings.push(verdict);
 else findings.push('history-provenance-unbound');
 return jsonData({findings:[...new Set(findings)],holds:[...new Set(holds)]});
}
