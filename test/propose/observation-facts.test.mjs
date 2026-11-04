import test from 'node:test';
import assert from 'node:assert/strict';
const implementation=await import('../../src/propose/observation-facts.mjs').catch(()=>({}));
const lineage={valid:true,scope:'published-lineage-only',predecessor:{pr:10,head:'a',tree:'b',merge:'c'},
 producer:{runId:100,runAttempt:1},version:'1.0.0',tree:'b',archiveDigest:'d',sourceSha:'e',sourceTree:'f',
 provenanceCryptographicallyVerified:false,privateAppIdentityAdmitted:false,authorized:false,
 observations:[{kind:'native-api',method:'GET',route:'/synthetic/one',status:'returned'}]};
const binding={repository:{id:123,full_name:'synthetic/library'},digest:'a',count:10,
 sourceCount:2,witnessCount:1,reviewCount:3,identity:{runId:500,status:'in_progress'},authorized:false};
const invoke=(name,left,right)=>{
 assert.equal(typeof implementation[name],'function','native observation fact comparator absent');
 return implementation[name](left,right);
};
test('lineage identity permits only diagnostic observation trace changes after native validation',()=>{
 const later=structuredClone(lineage);later.observations=[];
 assert.equal(invoke('sameLineageFacts',lineage,later),true);
 assert.equal(lineage.observations.length,1,'comparison must not rewrite the saved diagnostic evidence');
});
for(const key of Object.keys(lineage).filter(k=>k!=='observations'))
 test('lineage semantic field '+key+' remains exact despite a shorter diagnostic trace',()=>{
 const later=structuredClone(lineage);later.observations=[];later[key]=null;
 assert.equal(invoke('sameLineageFacts',lineage,later),false);
});
test('inspection binding identity permits only bounded reader observation count changes',()=>{
 const later=structuredClone(binding);later.count=1;
 assert.equal(invoke('sameInspectionFacts',binding,later),true);assert.equal(binding.count,10);
});
for(const key of Object.keys(binding).filter(k=>k!=='count'))
 test('inspection semantic field '+key+' remains exact despite a lower observation count',()=>{
 const later=structuredClone(binding);later.count=1;later[key]=null;
 assert.equal(invoke('sameInspectionFacts',binding,later),false);
});
test('unknown fields remain identity facts instead of being silently excluded',()=>{
 for(const [name,value] of [['sameLineageFacts',lineage],['sameInspectionFacts',binding]]){
  const later=structuredClone(value);later.extra=true;
  assert.equal(invoke(name,value,later),false);
 }
});
