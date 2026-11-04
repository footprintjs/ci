import test from 'node:test';
import assert from 'node:assert/strict';
import {runFoottraceMetadataHistoryInspection} from '../../src/propose/foottrace-metadata-history.mjs';
import {metadataInputFixture,PRIVATE} from './metadata-input-provider-fixture.mjs';
import {containsRecordText} from './record-text-fixture.mjs';

async function observe(kind,metadata='exact'){
 let armed=false,phases=0,changed=false,f;
 f=await metadataInputFixture({retainedJobs:'full-native',metadata,extend:['current-source','parent-source'].includes(kind)?'empty':true,pendingParent:['current-source','parent-source'].includes(kind)?'original':'current',
  change:(d,p)=>{
   if(p.includes('/actions/workflows/11/runs')){phases++;if(phases>=3)armed=true;}
   if(!armed)return;
   if(kind==='current-source'&&p.endsWith('/git/commits/'+f.M)){d.committer.date='2026-11-04T00:00:00Z';changed=true;}
   if(kind==='parent-source'&&p.endsWith('/git/commits/'+f.B)){d.committer.date='2026-11-04T00:00:00Z';changed=true;}
   if(kind==='retained-version'&&p.includes('/contents/package.json?ref='+f.B)){d.sha='f'.repeat(40);changed=true;}
   if(kind==='archive'&&p.endsWith('/actions/artifacts/800')){d.expired=true;changed=true;}
   if(kind==='candidate'&&p.includes('/assets?')&&!d.some(x=>x.id===7654321)){
    d.push({id:7654321,name:'publish-attempt-'+f.currentPrepared.version+'.json',state:'uploaded',size:12});changed=true;
   }
   if(kind==='lineage'&&!changed){
    const asset=[...f.f.releases.values()][0].assets[0],marker=JSON.parse(asset.raw);
    marker.runAttempt=marker.runAttempt===1?2:1;asset.raw=Buffer.from(JSON.stringify(marker));changed=true;
   }
   if(kind==='producer'&&p.includes('/runs/500/')&&d.jobs){d.jobs.find(j=>j.name==='proposal').status='completed';d.jobs.find(j=>j.name==='proposal').conclusion='success';changed=true;}
   if(kind==='workflows'&&p.includes('/runs/456/')&&d.jobs){d.jobs.find(j=>j.name==='plan').conclusion='neutral';changed=true;}
  },
  changeCommit:(d,n)=>{if(armed&&kind==='signature'){d.commit.verification.verified=false;changed=true;}},
  changeMetadata:d=>{if(armed&&kind==='metadata'){d.body+='later';changed=true;}}
 });
 const r=await runFoottraceMetadataHistoryInspection({transport:f.transport,context:f.fullContext,artifactId:800});
 return {r,f,armed,changed};
}
for(const kind of ['current-source','parent-source','archive','candidate','lineage','retained-version'])test('final native input boundary reacquires '+kind+' after retained history',async()=>{
 const {r,armed,changed}=await observe(kind);assert.equal(armed,true);
 assert.equal(r.status,'held','later '+kind+' facts cannot retain earlier input knowledge');
 assert.equal(changed,true,'the actual native reader must revisit '+kind);
 assert.equal(r.backend,null);assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
 assert.equal(containsRecordText(r.record,PRIVATE),false);
});
for(const kind of ['producer','workflows','signature','metadata'])test('full reacquisition retains existing '+kind+' refusal',async()=>{
 const {r,armed,changed}=await observe(kind);
 assert.equal(armed,true);assert.equal(changed,true);assert.equal(r.status,'held');assert.equal(r.backend,null);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
});
for(const metadata of ['exact','stale'])test('unchanged '+metadata+' observations remain diagnostic input only after full reacquisition',async()=>{
 const {r,armed}=await observe('unchanged',metadata);
 assert.equal(armed,true);assert.equal(r.status,'metadata-history-only');assert.equal(r.record.complete,true);
 assert.equal(r.backend.metadata.observation.matches,metadata==='exact');
 assert.equal(r.report.retainedEligibilityAdmitted,false);assert.equal(r.report.writerCredentialBindingAdmitted,false);
 assert.equal(r.report.authorized,false);assert.equal(r.report.executedWrites,0);
 assert.equal(containsRecordText(r.record,r.backend.metadata.payload.body),false);
});
