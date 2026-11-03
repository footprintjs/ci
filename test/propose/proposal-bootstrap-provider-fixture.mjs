import {createHash} from 'node:crypto';
import {metadataInputFixture} from './metadata-input-provider-fixture.mjs';
import preparation from '../../src/guards/release-prepare.cjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const TOOL='c'.repeat(40),PRIVATE='PRIVATE-HOST-SOURCE-AND-ENV';
export const code={
 workflow:Buffer.from('name: Reviewed native proposal fixture\non: [push]\njobs:\n  proposal:\n    steps:\n      - uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1\n        id: app\n        with:\n          client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}\n          private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}\n          owner: footprintjs\n          repositories: foottrace\n          permission-contents: write\n          permission-pull-requests: write\n          permission-actions: read\n      - env:\n          GH_TOKEN: ${{ steps.app.outputs.token }}\n          APP_PRIVATE_KEY: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}\n        run: node scripts/release-runner.cjs proposal\n'),
 entry:Buffer.from('// Reviewed current trusted entry fixture; no target helper is executed.\n'),
 profile:Buffer.from('// Reviewed independent host-code profile fixture, not candidate JSON.\n')
};
export const paths={workflow:'.github/workflows/publish.yml',entry:'scripts/release-runner.cjs',profile:'scripts/propose-host-profile.cjs'};
export async function proposalBootstrapFixture({changeProfile=()=>{},changeSource=()=>{},changeEnv=()=>{},dirty=false,...options}={}){
 const f=await metadataInputFixture({...options,changeCurrent:inventory=>{
  for(const [kind,bytes] of Object.entries(code))inventory.set(paths[kind],{bytes:Buffer.from(bytes),mode:'100644',sha:preparation.gitObject('blob',bytes)});
 }});
 const manifest={id:'foottrace-proposal-host-v1',sourceSha:f.M,sourceTree:f.current.commit.tree.sha,toolSha:TOOL};
 for(const [kind,bytes] of Object.entries(code))manifest[kind]={path:paths[kind],sha:preparation.gitObject('blob',bytes),sha256:sha(bytes),bytes:bytes.length,mode:'100644'};
 const host={
  readProfile:()=>{const value=structuredClone(manifest);changeProfile(value);return value;},
  requireClean:()=>{if(dirty)throw new Error(PRIVATE);},
  readSource:()=>{
   const value={sourceSha:f.M,sourceTree:f.current.commit.tree.sha,files:{}};
   for(const [kind,bytes] of Object.entries(code))value.files[kind]=Buffer.from(bytes);
   changeSource(value);return value;
  }
 };
 return {...f,host,makeInvocation:()=>f.makeClient(input=>{
  const c=f.fullContext,env={GITHUB_ACTIONS:'true',REPO_ID:String(c.repository.id),REPO_NAME:c.repository.full_name,SOURCE_SHA:c.sha,SOURCE_REF:c.ref,
   EVENT_NAME:c.eventName,RUN_ID:String(c.runId),RUN_ATTEMPT:String(c.runAttempt),GITHUB_REPOSITORY_ID:String(c.repository.id),GITHUB_REPOSITORY:c.repository.full_name,
   GITHUB_SHA:c.sha,GITHUB_WORKFLOW_SHA:c.sha,GITHUB_REF:c.ref,GITHUB_EVENT_NAME:c.eventName,GITHUB_RUN_ID:String(c.runId),GITHUB_RUN_ATTEMPT:String(c.runAttempt),
   GITHUB_JOB:'proposal',GITHUB_WORKFLOW_REF:'footprintjs/foottrace/.github/workflows/publish.yml@refs/heads/main',
   TOOL_SHA:TOOL,ARTIFACT_ID:'800',APP_SLUG:input.appIdentity.slug,APP_CLIENT_ID:input.appIdentity.clientId,
   GH_TOKEN:input.token,APP_PRIVATE_KEY:input.appIdentity.privateKey,UNREAD_OTHER:PRIVATE};
  changeEnv(env);return {env,host,fetcher:input.fetcher};
 })};
}
