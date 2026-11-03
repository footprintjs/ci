import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateConfig,evaluateStage,KNOWN_REASONS,REASON_MESSAGES} from '../../src/policy.mjs';
import {authorityWorld,ciWorld,sha,syntheticPackageArchive,authorityApiFixture} from '../upstream/test/release/helpers.mjs';
import archive from '../../src/guards/release-archive.cjs';
const config=()=>validateConfig({schemaVersion:1,profile:'foottrace-v1',repository:{id:123,full_name:'footprintjs/foottrace'},package:'foottrace',app:{slug:'release-app',clientId:'public-client-id'},workflow:'.github/workflows/publish.yml',requiredGates:['check (22)','check (24)','tested-tree','Analyze (actions)','Analyze (javascript-typescript)']});
const security=()=>{const f=authorityApiFixture();return {workflow:{id:43,path:'.github/workflows/codeql.yml'},runs:[f.q],attempt:f.q,jobs:f.jobs,runsComplete:true,jobsComplete:true};};
const review=head=>({reviewer:'Claude',verdict:'merge',headSha:head,publicRecord:{id:500,headSha:head,disclosedDelegation:true}});
function authority(){const world=authorityWorld();world.reviews[0].body=`Delegated approval following Claude exact-head verdict ${world.expected.headSha}`;return {world,independentReview:review(world.expected.headSha)};}
test('authority preserves native eligibility and adds exact-head public verdict plus disclosure',()=>{
 const c=config(),f=authority();assert.equal(evaluateStage('authority',f,c).outcome,'pass');
 for(const change of [x=>delete x.independentReview,x=>x.independentReview.headSha=sha('f'),x=>x.independentReview.publicRecord.disclosedDelegation=false,x=>x.world.reviews[0].body='Approved',x=>x.world.reviews[0].body='Claude '+x.world.expected.headSha,x=>x.world.reviews[0].body='Delegated approval '+x.world.expected.headSha,x=>x.world.reviews[0].body='Delegated approval Claude',x=>x.world.reviews[0].user.type='Bot',x=>x.world.reviews[0].commit_id=sha('a'),x=>x.world.reviewerPermissions[0].permission='read',x=>x.world.reviews.push({...x.world.reviews[0],id:11,state:'CHANGES_REQUESTED'}),x=>x.world.reviews.push({...x.world.reviews[0],id:11,state:'CHANGES_REQUESTED',user:{id:12,login:'another-reviewer',type:'User'}})]){const x=authority();change(x);assert.equal(evaluateStage('authority',x,c).outcome,'hold');}
});
test('first native authority refusal is retained before added review conditions',()=>{
 const f=authority();f.world.event.sha=sha('f');delete f.independentReview;
 assert.equal(evaluateStage('authority',f,config()).reason,'authority-event');
});
test('native CI reuse is exact latest run, current attempt and unique gates',()=>{
 const c=config();assert.equal(evaluateStage('verdict',{world:ciWorld(),security:security()},c).reason,'CI_REUSE');
 for(const change of [w=>w.runs.unshift({...w.runs[0],id:999,conclusion:'failure'}),w=>w.attempt.run_attempt++,w=>w.jobs.push({...w.jobs[0]}),w=>w.jobs[2].steps[0].name='tested tree '+sha('f')]){const w=ciWorld();change(w);assert.equal(evaluateStage('verdict',{world:w,security:security()},c).outcome,'hold');}
});
test('archive adapter uses actual bytes and binds producer manifest digests',()=>{
 const bytes=syntheticPackageArchive('1.10.0'),checked=archive.inspectArchive(bytes,{package:'foottrace',version:'1.10.0'});
 const expected={repositoryId:123,runId:200,runAttempt:1,jobId:300,artifactId:400,artifactName:'release-build',sourceSha:sha('1'),tree:sha('2'),package:'foottrace',version:'1.10.0',jobName:'build'};
 const world={expected,artifact:{id:400,name:'release-build',expired:false,workflow_run:{id:200,head_sha:sha('1'),repository_id:123}},producer:{id:300,name:'build',run_id:200,run_attempt:1,status:'completed',conclusion:'success',uploadArtifactId:400},manifest:{...expected,...checked}};
 assert.equal(evaluateStage('build',{world,bytes},config()).outcome,'pass');
 world.artifact.workflow_run.head_sha=sha('f');assert.equal(evaluateStage('build',{world,bytes},config()).outcome,'hold');world.artifact.workflow_run.head_sha=sha('1');
 world.manifest.sha256=sha('a');assert.equal(evaluateStage('build',{world,bytes},config()).outcome,'hold');
});
test('uncertain reservation and registry conflict never regain publish opportunity',()=>{
 const expected={integrity:'sha512-valid'};
 for(const journal of [{},{state:'unknown'},true])assert.equal(evaluateStage('publish',{world:{expected,journal}},config()).outcome,'verify-only');
 assert.equal(evaluateStage('publish',{world:{expected,registry:{integrity:'sha512-other'}}},config()).outcome,'hold');
 assert.equal(evaluateStage('publish',{world:{expected}},config()).outcome,'would-write');
});
test('unobserved stages hold; native verification observations disclose verify-only status',()=>{
 const c=config();for(const stage of ['plan','propose','verify','build','authority','publish','verdict'])assert.equal(evaluateStage(stage,{},c).outcome,'hold');
 assert.equal(evaluateStage('verify',{verification:{state:'pending-registry'}},c).outcome,'verify-only');
 const plan={mode:'verify',repository:c.repository,sha:sha('1'),tree:sha('2'),package:'foottrace',version:'1.10.0'};
 assert.equal(evaluateStage('plan',{plan},c).reason,'PLAN_VERIFY_ONLY');
});
test('all stage outputs contain only bounded public facts and static messages',()=>{
 const f=authority();f.world.expected.pr={secret:'PRIVATE_TOKEN'};f.world.pulls[0].number=f.world.expected.pr;
 const result=evaluateStage('authority',f,config());assert(!JSON.stringify(result).includes('PRIVATE_TOKEN'));assert(KNOWN_REASONS.has(result.reason));assert.equal(typeof REASON_MESSAGES[result.reason],'string');
});
test('every source port and fixture snapshot matches complete provenance hashes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../provenance/upstream.json',import.meta.url)));
 assert.equal(manifest.commit,'f55250adcbe9bbfdde75b6bc2c889bac791ca131');
 for(const row of manifest.files){const bytes=readFileSync(new URL('../../'+row.destination,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,row.destination);if(row.adaptation==='exact')assert.equal(row.sha256,row.sourceSha256);}
 assert.equal(manifest.files.filter(r=>r.destination.startsWith('src/guards/')&&r.adaptation==='exact').length,5);
 const derived=manifest.files.filter(r=>r.destination.startsWith('src/guards/')&&r.adaptation!=='exact'&&r.dataPatch);
 assert.equal(derived.length,1);assert.equal(derived[0].destination,'src/guards/release-github.cjs');
 const row=derived[0],bytes=readFileSync(new URL('../../'+row.dataPatch.path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.dataPatch.sha256);
 const patch=JSON.parse(bytes),source=readFileSync(new URL('../../'+patch.source,import.meta.url));
 assert.equal(createHash('sha256').update(source).digest('hex'),row.sourceSha256);
 assert.equal(patch.destination,row.destination);assert.equal(patch.sourceSha256,row.sourceSha256);assert.equal(patch.outputSha256,row.sha256);
 const currentLines=readFileSync(new URL('../../'+row.destination,import.meta.url),'utf8').trimEnd().split('\n').length;
 const originalLines=source.toString('utf8').trimEnd().split('\n').length;
 assert.ok(currentLines<=originalLines,'src/guards/release-github.cjs grew beyond its immutable native source: '+currentLines+' > '+originalLines);

 let transformed=source.toString('utf8');assert.equal(patch.replacements.length,2);
 for(const replacement of patch.replacements){assert.equal(transformed.split(replacement.before).length-1,1);transformed=transformed.replace(replacement.before,replacement.after);}
 assert.equal(transformed,readFileSync(new URL('../../'+row.destination,import.meta.url),'utf8'));
 const policy=patch.extractedPolicy,policyRow=manifest.files.find(r=>r.destination===policy.destination);
 assert.equal(policy.destination,'src/guards/proposal-metadata.cjs');assert.ok(policyRow);
 assert.equal(policyRow.sha256,policy.sha256);assert.equal(policyRow.sourceSha256,row.sourceSha256);
 assert.equal(policyRow.extraction.path,row.dataPatch.path);assert.equal(policyRow.extraction.field,'extractedPolicy');
 let policySource=policy.moduleTemplate;
 for(const [marker,chunk] of [['__TITLE__',policy.sourceTitle],['__BODY__',policy.sourceBody]]){
  assert.equal(source.toString('utf8').split(chunk).length-1,1);
  assert.equal(policySource.split(marker).length-1,1);let value=chunk;
  for(const replacement of policy.rewrites)value=value.split(replacement.before).join(replacement.after);
  policySource=policySource.replace(marker,value);
 }
 const policyBytes=readFileSync(new URL('../../'+policy.destination,import.meta.url));
 assert.equal(policySource,policyBytes.toString('utf8'));
 assert.equal(createHash('sha256').update(policyBytes).digest('hex'),policy.sha256);

});
