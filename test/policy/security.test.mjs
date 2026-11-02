import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,evaluateStage,isApprovedConfig} from '../../src/policy.mjs';
import {authorityApiFixture} from '../upstream/test/release/helpers.mjs';
const config=()=>validateConfig({schemaVersion:1,profile:'foottrace-v1',repository:{id:123,full_name:'footprintjs/foottrace'},package:'foottrace',app:{slug:'release-app',clientId:'public-client-id'},workflow:'.github/workflows/publish.yml',requiredGates:['check (22)','check (24)','tested-tree','Analyze (actions)','Analyze (javascript-typescript)']});
function facts(){const f=authorityApiFixture();return {world:f.ci,security:{workflow:{id:43,path:'.github/workflows/codeql.yml'},runs:[f.q],attempt:{...f.q},jobs:f.jobs,runsComplete:true,jobsComplete:true}};}
test('verdict requires native runtime reuse and independent mandatory latest CodeQL gates',()=>{
 const c=config(),f=facts();assert.equal(evaluateStage('verdict',f,c).reason,'CI_REUSE');
 for(const change of [x=>delete x.security,x=>x.security.jobs.pop(),x=>x.security.jobs[0].conclusion='skipped',x=>x.security.jobs[1].conclusion='failure',x=>x.security.runs.push({...x.security.runs[0],id:999,conclusion:'failure'}),x=>x.security.attempt.run_attempt++,x=>x.security.runs[0].head_sha='f'.repeat(40),x=>x.security.jobs.push({...x.security.jobs[0]}),x=>x.security.runsComplete=false,x=>x.security.jobsComplete=false,x=>x.security.workflow.path='.github/workflows/fake.yml']){
  const x=facts();change(x);assert.equal(evaluateStage('verdict',x,c).outcome,'hold');
 }
});
test('approved configuration brand cannot be copied or replaced by shape-compatible raw data',()=>{
 const c=config();assert.equal(isApprovedConfig(c),true);assert.equal(isApprovedConfig({...c}),false);assert.equal(isApprovedConfig(null),false);
});
