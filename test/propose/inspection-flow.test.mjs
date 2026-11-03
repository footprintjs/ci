import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { candidateVersions } from '../../src/propose/candidate-publication.mjs';
import { runProposeInspection } from '../../src/propose/inspection-flow.mjs';
import { createFoottracePreparationProfile, createFoottraceRetainedAttemptProfile } from '../../src/propose/foottrace-profile.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { sourceFixture } from './prepared-fixtures.mjs';
import { explainReleaseRecord } from '../../src/record.mjs';
const secret = 'PRIVATE-INSPECTION-PORT-BODY';
function fixture() {
  const profile = createFoottracePreparationProfile(), witness = preparationWitnessFixture(), currentSource = sourceFixture();
  const calls = [], inputs = { pending: { witnesses: [witness], predecessor: witness.predecessor }, currentSource, currentPreparationDate: null };
  const readers = {
    readOrdinaryPreparation: async prepared => { calls.push('ordinary'); const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
      const references=[...prepared.preparationRefs.map(ref=>({kind:'pending',sourceSha:ref.sourceSha,sourceTree:ref.sourceTree,targetTree:ref.pendingTree,fromVersion:prepared.fromVersion,version:ref.version,preparationDate:ref.preparationDate,queueDigest:'a'.repeat(64),inventoryDigest:'b'.repeat(64),preparationDigest:'c'.repeat(64),archivedIntentRecords:0})),
       {kind:'current',sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,targetTree:prepared.targetTree,fromVersion:prepared.fromVersion,version:prepared.version,preparationDate:'2026-11-02',queueDigest:hash(prepared.queue),inventoryDigest:'b'.repeat(64),preparationDigest:hash(prepared.prepared),archivedIntentRecords:0}];
      return {valid:true,scope:'native-ordinary-preparation-only',repository:{id:123,full_name:'footprintjs/foottrace'},references,preparationKind:'next',digest:'e'.repeat(64),providerContinuityProved:false,erasedHistoryProved:false,retainedEligibilityAdmitted:false,privateAppIdentityAdmitted:false,authorized:false,observations:[],privateBody:secret}; },
    readCurrentPreparation: async (prepared,current) => { calls.push('current-archive'); return {valid:true,scope:'current-preparation-archive-only',reference:{artifactId:800,jobId:current.identity.prepareJobId,repositoryId:current.identity.repositoryId,runId:current.identity.runId,runAttempt:current.identity.runAttempt,sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,targetTree:prepared.targetTree,version:prepared.version,archiveDigest:'e'.repeat(64),bytes:1000,providerDigestPresent:true,proposerDigest:current.digest},digest:'f'.repeat(64),providerDigestPresent:true,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,authorized:false,observations:[],privateBody:secret}; },
    readCurrentProposer: async prepared => { calls.push('proposer'); return { valid:true,scope:'current-proposer-identity-only',identity:{repositoryId:123,sourceSha:prepared.sourceSha,sourceTree:prepared.sourceTree,runId:500,runAttempt:1,prepareJobId:600,proposalJobId:601,appId:77,botId:500,appSettingsDigest:'c'.repeat(64)},digest:'d'.repeat(64),privateAppIdentityAdmitted:true,writerCredentialBindingAdmitted:false,retainedEligibilityAdmitted:false,authorized:false,observations:[],privateBody:secret }; },
    readRetainedWitnesses: async (prepared,collection) => { calls.push('witnesses'); return { valid:true,scope:'retained-preparation-witnesses-only',repository:{id:123,full_name:'footprintjs/foottrace'},workflowDigest:collection.digest,witnesses:prepared.preparationRefs.map(ref=>({profileId:ref.profileId,sourceSha:ref.sourceSha,sourceTree:ref.sourceTree,pendingSha:ref.pendingSha,pendingTree:ref.pendingTree,preparationDate:ref.preparationDate,archiveDigest:ref.artifactDigest,producer:ref.producer,artifactAttemptFieldInvented:false})),digest:'b'.repeat(64),retainedEligibilityAdmitted:false,privateAppIdentityAdmitted:false,authorized:false,observations:[],privateBody:secret }; },
    readRetainedVersions: async (prepared,collection) => { calls.push('versions'); return { valid:true,scope:'retained-source-versions-only',repository:{id:123,full_name:'footprintjs/foottrace'},packageName:'foottrace',workflowDigest:collection.digest,versions:candidateVersions(prepared, 'pending-chain'),sources:[...new Set(collection.runs.map(run=>run.head_sha))].map(sourceSha=>({sourceSha,blobSha:'c'.repeat(40),bytesSha256:'d'.repeat(64),packageName:'foottrace',version:prepared.fromVersion})),attemptCount:collection.attempts.length,nonterminalAttempts:[],candidateEffectAttempts:[],digest:'a'.repeat(64),immutablePathBinding:'provider-contents-at-commit',providerContinuityProved:false,erasedHistoryProved:false,retainedEligibilityAdmitted:false,authorized:false,observations:[],privateBody:secret }; },
    readCandidatePublication: async prepared => { calls.push('candidate'); return { valid:true,scope:'candidate-publication-conflicts-only',repository:{id:123,full_name:'footprintjs/foottrace'},packageName:'foottrace',versions:candidateVersions(prepared, 'pending-chain'),releaseCount:1,assetCount:1,digest:'8'.repeat(64),registryAbsenceOnlyAtRead:true,providerContinuityProved:false,erasedHistoryProved:false,retainedEligibilityAdmitted:false,authorized:false,observations:[],privateBody:secret }; },
    readWorkflows: async () => { calls.push('workflows'); return { valid:true,scope:'retained-workflow-observations-only',repository:{id:123,full_name:'footprintjs/foottrace'},workflow:{id:11,path:'.github/workflows/publish.yml',state:'active'},runs:[],attempts:[],artifacts:[],nonterminal:[],effectStages:[],digest:'7'.repeat(64),providerContinuityProved:false,erasedHistoryProved:false,retainedEligibilityAdmitted:false,authorized:false,observations:[] }; },
    readLineage: async expected => { calls.push('lineage'); return { valid: true, scope: 'published-lineage-only', predecessor: expected.predecessor,
      version: expected.fromVersion, tree: expected.predecessor.tree, archiveDigest: '4'.repeat(64), producer:{runId:100,runAttempt:1}, authorized: false,
      privateAppIdentityAdmitted: false, observations: [], privateBody: secret }; },
    readReviews: async prepared => { calls.push('reviews'); const refs=prepared.preparationRefs,last=refs.at(-1);
      return { valid:true,scope:'pending-reviews-only',reference:{pr:41,botId:500,head:prepared.pendingSha,tree:prepared.pendingTree,
        source:prepared.sourceSha,observedBase:last.sourceSha,parents:[last.sourceSha,prepared.predecessor.head]},
        reviewCount:0,reviewerCount:0,priorHeadApprovalReviews:0,reviewDigest:'5'.repeat(64),permissionDigest:'6'.repeat(64),
        retainedEligibilityAdmitted:false,privateAppIdentityAdmitted:false,authorized:false,adjacentSnapshotOnly:true,
        observations:[],privateBody:secret }; },
    readAncestry: async prepared => { calls.push('ancestry'); let from = prepared.predecessor.merge; const edges = prepared.preparationRefs.map(ref => {
      const edge = { from, to: ref.sourceSha }; from = ref.sourceSha; return edge;
    }); edges.push({ from, to: prepared.sourceSha }); return { valid: true, scope: 'source-ancestry-only', sourceSha: prepared.sourceSha,
      authorized: false, edges, observations: [], privateBody: secret }; },
  };
  return { profile, inputs, readers, calls, retainedProfile:createFoottraceRetainedAttemptProfile() };
}
test('native inspection joins prepared inputs, exact published L and source edges while leaving eligibility unadmitted', async () => {
  const f = fixture(), result = await runProposeInspection(f);
  assert.equal(result.status, 'inspection-only'); assert.equal(result.record.complete, true);
  assert.deepEqual(f.calls, ['ordinary', 'lineage', 'ancestry', 'reviews', 'workflows', 'witnesses', 'versions', 'candidate', 'proposer', 'current-archive']); assert.equal(result.report.authorized, false);
  assert.equal(result.report.executedWrites, 0); assert.equal(result.report.eligibilityAdmitted, false);
  assert.equal(result.backend.prepared.valid, true);
  assert.equal(result.record.snapshot.sharedState.proposeEvidenceRefs.length, 10);
});
test('a lineage result bound to another predecessor holds before ancestry', async () => {
  const f = fixture(), original = f.readers.readLineage;
  f.readers.readLineage = async x => ({ ...await original(x), predecessor: { ...x.predecessor, head: 'f'.repeat(40) } });
  const result = await runProposeInspection(f);
  assert.equal(result.status, 'held'); assert.equal(result.backend, null); assert.deepEqual(f.calls, ['ordinary', 'lineage']);
});
test('a changed ancestry edge cannot be joined to valid prepared inputs', async () => {
  const f = fixture(), original = f.readers.readAncestry;
  f.readers.readAncestry = async x => { const value = await original(x); value.edges[0].to = 'f'.repeat(40); return value; };
  assert.equal((await runProposeInspection(f)).status, 'held');
});
test('unavailable lineage takes the recorded native hold branch without another reader', async () => {
  const f = fixture(); f.readers.readLineage = async () => { f.calls.push('lineage'); throw new Error(secret); };
  const result = await runProposeInspection(f);
  assert.equal(result.status, 'held'); assert.equal(result.record.complete, true);
  assert.deepEqual(f.calls, ['ordinary', 'lineage']); assert.equal(result.backend, null);
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test('saved native evidence explains the inspection decision without repeating either external read', async () => {
  const f = fixture(), result = await runProposeInspection(f), calls = [...f.calls];
  const saved = JSON.parse(JSON.stringify(result.record)), explanation = explainReleaseRecord(saved, 'proposeResult');
  assert.match(explanation, /proposeInspectionFacts|inspection|evidence/i);
  assert.doesNotMatch(explanation, /Incomplete native|Unreadable native|Unsupported release/); assert.deepEqual(f.calls, calls);
});
test('rich reader returns never enter the record or report', async () => {
  const result = await runProposeInspection(fixture()); assert.equal(result.record.complete, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
});
test('record exhaustion returns no usable backend even after source inspection succeeded', async () => {
  const result = await runProposeInspection({ ...fixture(), recordLimitBytes: 256 });
  assert.equal(result.status, 'incomplete'); assert.equal(result.backend, null); assert.equal(result.report.authorized, false);
});
test('invalid prepared source stops both external readers and records a hold', async () => {
  const f = fixture(); f.inputs = {};
  const result = await runProposeInspection(f);
  assert.equal(result.status, 'held'); assert.equal(result.record.complete, true); assert.deepEqual(f.calls, []);
});
test('native ancestry adapter composes through the inspection port with its actual pinned guards', async () => {
  const { createFoottraceAncestryReader } = await import('../../src/propose/foottrace-ancestry.mjs');
  const f = fixture(), calls = [], context = { repository: { id: 123, full_name: 'footprintjs/foottrace' }, sha: f.inputs.currentSource.commit.sha };
  f.readers.readAncestry = createFoottraceAncestryReader({ context, api: async (method, route) => {
    calls.push({ method, route });
    if (route.endsWith('/git/ref/heads/main')) return { data: { object: { sha: context.sha } } };
    const [from, to] = route.split('/compare/')[1].split('?')[0].split('...');
    return { data: { status: from === to ? 'identical' : 'ahead', ahead_by: from === to ? 0 : 1, behind_by: 0,
      total_commits: from === to ? 0 : 1, base_commit: { sha: from }, merge_base_commit: { sha: from }, commits: from === to ? [] : [{ sha: to }] } };
  } });
  const result = await runProposeInspection(f);
  assert.equal(result.status, 'inspection-only'); assert.ok(calls.length >= 3); assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(result.backend.ancestry.sourceSha, context.sha);
});
test('a reader cannot promote current-run authority as a side effect of its data-lineage result', async () => {
  const f = fixture(), original = f.readers.readLineage;
  f.readers.readLineage = async input => ({ ...await original(input), authorized: true });
  const result = await runProposeInspection(f); assert.equal(result.status, 'held'); assert.equal(result.backend, null);
});
test('accessor-supplied reader functions are refused without invoking the accessor', async () => {
  const f = fixture(); let invoked = false;
  Object.defineProperty(f.readers, 'readLineage', { get() { invoked = true; throw new Error(secret); } });
  const result = await runProposeInspection(f); assert.equal(result.status, 'held'); assert.equal(invoked, false);
  assert.equal(result.record.complete, true); assert.deepEqual(f.calls, []);
});

test('unavailable reviews take a recorded hold rather than a usable prepared backend',async()=>{
 const f=fixture();f.readers.readReviews=async()=>{f.calls.push('reviews');throw new Error(secret);};const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.backend,null);assert.deepEqual(f.calls,['ordinary', 'lineage','ancestry','reviews']);assert.equal(JSON.stringify(r).includes(secret),false);
});
test('a review result for another pending head cannot join the prepared inputs',async()=>{
 const f=fixture(),original=f.readers.readReviews;f.readers.readReviews=async x=>{const r=await original(x);r.reference.head='f'.repeat(40);return r;};assert.equal((await runProposeInspection(f)).status,'held');
});
test('a review reader cannot promote its result to complete retained eligibility or current authority',async()=>{
 const f=fixture(),original=f.readers.readReviews;f.readers.readReviews=async x=>({...await original(x),retainedEligibilityAdmitted:true});assert.equal((await runProposeInspection(f)).status,'held');
});
test('failed source ancestry prevents native review acquisition',async()=>{
 const f=fixture();f.readers.readAncestry=async()=>{f.calls.push('ancestry');return {valid:false};};const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.deepEqual(f.calls,['ordinary', 'lineage','ancestry']);
});
test('the actual native pending-review reader composes through the inspected immutable head',async()=>{
 const {createFoottraceReviewReader}=await import('../../src/propose/foottrace-reviews.mjs');const {pendingProviderFixture}=await import('./pending-provider-fixture.mjs');
 const f=fixture(),provider=pendingProviderFixture();f.inputs.currentSource.commit.sha=provider.context.sha;const source=provider.api;
 f.readers.readReviews=createFoottraceReviewReader({...provider,api:async(method,route,body)=>route.includes('/reviews?')?{data:[]}:source(method,route,body)});
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.backend.reviews.reviewCount,0);assert.equal(r.backend.reviews.reference.source,provider.context.sha);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(r.report.authorized,false);
});
test('saved native evidence names an effective pending approval as the hold cause',async()=>{
 const {createFoottraceReviewReader}=await import('../../src/propose/foottrace-reviews.mjs');const {pendingProviderFixture}=await import('./pending-provider-fixture.mjs');
 const f=fixture(),provider=pendingProviderFixture();f.inputs.currentSource.commit.sha=provider.context.sha;const source=provider.api;
 f.readers.readReviews=createFoottraceReviewReader({...provider,api:async(method,route,body)=>{
  if(route.includes('/reviews?'))return {data:[{id:100,state:'APPROVED',commit_id:provider.prepared.pendingSha,user:{id:42,type:'User',login:'reviewer42'}}]};
  if(route.includes('/collaborators/'))return {data:{permission:'write',user:{id:42,type:'User',login:'reviewer42'}}};
  return source(method,route,body);
 }});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.reviewReason,'effective-approval');assert.equal(r.backend,null);assert.equal(r.report.authorized,false);
 const saved=JSON.parse(JSON.stringify(r.record));assert.doesNotMatch(explainReleaseRecord(saved,'proposeResult'),/Incomplete native|Unreadable native/);
});
test('a declared synthetic source-only profile never receives an invented published-parent identity',async()=>{
 const {packageProfile}=await import('../../src/propose/package-profile.mjs');const original=createFoottracePreparationProfile();
 const f=fixture();f.profile=packageProfile({...original,id:'synthetic-source-only',originalParentLaw:'source-only'});f.inputs.pending.witnesses[0].pendingSource.commit.parents=f.inputs.pending.witnesses[0].pendingSource.commit.parents.slice(0,1);
 const before=f.readers.readReviews;f.readers.readReviews=async prepared=>{const result=await before(prepared);result.reference.parents=[prepared.preparationRefs.at(-1).sourceSha];return result;};
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.backend.reviews.reference.parents.length,1);assert.equal(r.report.authorized,false);
});

test('retained workflows join only after native pending reviews',async()=>{
 const f=fixture();const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.backend.workflows.repository.id,123);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.workflows,true);assert.deepEqual(f.calls,['ordinary', 'lineage','ancestry','reviews','workflows','witnesses','versions','candidate','proposer','current-archive']);
});
test('a workflow collection bound to another repository cannot join',async()=>{
 const f=fixture(),prior=f.readers.readWorkflows;f.readers.readWorkflows=async()=>({...await prior(),repository:{id:999,full_name:'fork/foottrace'}});assert.equal((await runProposeInspection(f)).status,'held');
});
test('a workflow observation reader cannot claim continuous history or full eligibility',async()=>{
 const f=fixture(),prior=f.readers.readWorkflows;f.readers.readWorkflows=async()=>({...await prior(),providerContinuityProved:true});assert.equal((await runProposeInspection(f)).status,'held');
});
test('a failed pending review prevents workflow acquisitions',async()=>{
 const f=fixture();f.readers.readReviews=async()=>({valid:false,reason:'effective-approval'});const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(f.calls.includes('workflows'),false);
});
test('actual bounded retained workflow reader composes through native recorded stages',async()=>{
 const {createRetainedWorkflowReader}=await import('../../src/propose/retained-workflows.mjs');const {fixture:workflowFixture}=await import('./retained-workflow-provider-fixture.mjs');
 const f=fixture(),wf=workflowFixture();f.readers.readWorkflows=createRetainedWorkflowReader(wf);const r=await runProposeInspection(f);
 assert.equal(r.status,'inspection-only');assert.equal(r.backend.workflows.attempts,2);assert.equal(r.record.snapshot.sharedState.proposeResult.facts.workflowAttempts,2);
 assert.equal(r.report.eligibilityAdmitted,false);assert.equal(r.report.authorized,false);assert.equal(JSON.stringify(r).includes('PRIVATE-WORKFLOW-BODY'),false);
});

test('retained nonterminal and effect observations stay visible and never admit eligibility',async()=>{
 const f=fixture(),prior=f.readers.readWorkflows;f.readers.readWorkflows=async()=>({...await prior(),nonterminal:[{runId:100}],effectStages:[{id:1}]});
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');
 const facts=r.record.snapshot.sharedState.proposeResult.facts;assert.equal(facts.workflowNonterminal,1);assert.equal(facts.workflowEffectStages,1);
 assert.equal(facts.eligibilityAdmitted,false);assert.equal(facts.authorized,false);
 const saved=JSON.parse(JSON.stringify(r.record));assert.doesNotMatch(explainReleaseRecord(saved,'proposeResult'),/Incomplete native|Unreadable native/);
});

test('candidate reservation evidence records the finite hold reason and no usable backend',async()=>{
 const f=fixture();f.readers.readCandidatePublication=async()=>({valid:false,reason:'candidate-reservation-or-publication',privateBody:secret});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.backend,null);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.candidateReason,'candidate-reservation-or-publication');assert.equal(JSON.stringify(r).includes(secret),false);
});
test('a candidate reader cannot omit the original pending version',async()=>{
 const f=fixture(),original=f.readers.readCandidatePublication;f.readers.readCandidatePublication=async prepared=>({...await original(prepared),versions:[]});
 assert.equal((await runProposeInspection(f)).status,'held');
});
test('candidate observations cannot promote registry absence into continuous history',async()=>{
 const f=fixture(),original=f.readers.readCandidatePublication;f.readers.readCandidatePublication=async prepared=>({...await original(prepared),providerContinuityProved:true});
 assert.equal((await runProposeInspection(f)).status,'held');
});
test('an unavailable retained workflow collection prevents candidate reads',async()=>{
 const f=fixture();f.readers.readWorkflows=async()=>({valid:false});const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(f.calls.includes('candidate'),false);
});
test('the actual native Foottrace registry adapter composes without inspecting a published predecessor archive',async()=>{
 const {createFoottraceCandidatePublicationReader}=await import('../../src/propose/candidate-publication.mjs');
 const {fixture:candidateFixture}=await import('./candidate-provider-fixture.mjs');const f=fixture(),provider=candidateFixture(),registryCalls=[];
 f.readers.readCandidatePublication=createFoottraceCandidatePublicationReader({...provider,candidateScope:'pending-chain',registry:()=>async url=>{registryCalls.push(url);return new Response('',{status:404});}});
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.candidatePublication,true);
 assert.ok(registryCalls.length>0);assert.ok(registryCalls.every(url=>!url.includes('/latest')&&!url.endsWith('.tgz')));
 assert.equal(r.report.eligibilityAdmitted,false);assert.equal(r.report.authorized,false);
});

test('registry-absence-at-read qualification cannot be waived by a candidate reader',async()=>{
 const f=fixture(),original=f.readers.readCandidatePublication;
 f.readers.readCandidatePublication=async prepared=>({...await original(prepared),registryAbsenceOnlyAtRead:false});
 assert.equal((await runProposeInspection(f)).status,'held');
});

test('retained source versions join the exact preceding workflow digest',async()=>{
 const f=fixture(),original=f.readers.readRetainedVersions;f.readers.readRetainedVersions=async(...args)=>({...await original(...args),workflowDigest:'e'.repeat(64)});
 assert.equal((await runProposeInspection(f)).status,'held');assert.equal(f.calls.includes('candidate'),false);
});
test('candidate effect uncertainty records a hold before publication snapshot acquisition',async()=>{
 const f=fixture();f.readers.readRetainedVersions=async()=>({valid:false,reason:'candidate-effect-or-submission-uncertain'});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.sourceVersionReason,'candidate-effect-or-submission-uncertain');assert.equal(f.calls.includes('candidate'),false);
});
test('source-version data cannot admit full eligibility as a side effect',async()=>{
 const f=fixture(),original=f.readers.readRetainedVersions;f.readers.readRetainedVersions=async(...args)=>({...await original(...args),retainedEligibilityAdmitted:true});
 assert.equal((await runProposeInspection(f)).status,'held');
});
test('the actual retained package/version reader composes with the actual collected workflow snapshot',async()=>{
 const {sourceVersionFixture}=await import('./source-version-provider-fixture.mjs');const {createRetainedSourceVersionReader}=await import('../../src/propose/retained-source-versions.mjs');
 const f=fixture(),provider=await sourceVersionFixture();f.readers.readWorkflows=async()=>provider.collection;
 f.readers.readRetainedVersions=createRetainedSourceVersionReader(provider);const r=await runProposeInspection(f);
 assert.equal(r.status,'inspection-only');assert.equal(r.backend.sourceVersions.sourceCount,1);assert.equal(r.record.snapshot.sharedState.proposeResult.facts.sourceVersions,true);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(JSON.stringify(r).includes('PRIVATE-WORKFLOW-BODY'),false);
});

test('a source-version reader cannot drop a collected immutable source',async()=>{
 const {sourceVersionFixture}=await import('./source-version-provider-fixture.mjs');const f=fixture(),provider=await sourceVersionFixture(),original=f.readers.readRetainedVersions;
 f.readers.readWorkflows=async()=>provider.collection;f.readers.readRetainedVersions=async(...args)=>({...await original(...args),sources:[]});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(f.calls.includes('candidate'),false);
});

test('retained preparation witnesses join the preceding workflow digest',async()=>{
 const f=fixture(),original=f.readers.readRetainedWitnesses;f.readers.readRetainedWitnesses=async(...args)=>({...await original(...args),workflowDigest:'e'.repeat(64)});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(f.calls.includes('versions'),false);
});
test('a witness cannot substitute artifact digest or preparation day',async()=>{
 const f=fixture(),original=f.readers.readRetainedWitnesses;f.readers.readRetainedWitnesses=async(...args)=>{const r=await original(...args);r.witnesses[0].archiveDigest='f'.repeat(64);return r;};
 assert.equal((await runProposeInspection(f)).status,'held');
});
test('an unavailable actual artifact witness is recorded before later reads',async()=>{
 const f=fixture();f.readers.readRetainedWitnesses=async()=>({valid:false,reason:'retained-preparation-witness-unavailable'});const r=await runProposeInspection(f);
 assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.witnessReason,'retained-preparation-witness-unavailable');assert.equal(f.calls.includes('versions'),false);
});
test('actual retained preparation reader and ZIP download join actual collected native metadata',async()=>{
 const {witnessProviderFixture}=await import('./witness-provider-fixture.mjs');const {createRetainedWitnessReader}=await import('../../src/propose/retained-witnesses.mjs');
 const f=fixture(),provider=await witnessProviderFixture();f.inputs.currentSource.commit.sha=provider.prepared.sourceSha;
 f.readers.readWorkflows=async()=>provider.collection;f.readers.readRetainedWitnesses=createRetainedWitnessReader(provider);
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.backend.retainedWitnesses.witnessCount,1);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.witnessesBound,true);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(JSON.stringify(r).includes('PRIVATE-WITNESS-PROVIDER-BODY'),false);
});

test('current proposer identity must belong to the actual pending App bot',async()=>{
 const f=fixture(),original=f.readers.readCurrentProposer;f.readers.readCurrentProposer=async prepared=>{const r=await original(prepared);r.identity.botId=999;return r;};assert.equal((await runProposeInspection(f)).status,'held');
});
test('current identity metadata cannot promote itself into writer credential or effect authority',async()=>{
 const f=fixture(),original=f.readers.readCurrentProposer;f.readers.readCurrentProposer=async prepared=>({...await original(prepared),writerCredentialBindingAdmitted:true});
 assert.equal((await runProposeInspection(f)).status,'held');
});
test('a historical completed run refuses with its native status reason recorded',async()=>{
 const {proposerFixture}=await import('./proposer-provider-fixture.mjs');const {createFoottraceProposerReader}=await import('../../src/propose/current-proposer.mjs');
 const provider=proposerFixture({change:(d,p)=>{if(p.endsWith('/actions/runs/500')){d.status='completed';d.conclusion='success';}}}),f=fixture();
 f.inputs.currentSource.commit.sha=provider.context.sha;f.readers.readCurrentProposer=createFoottraceProposerReader(provider);
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.proposerNativeReason,'current-run-status');assert.equal(r.backend,null);
});
test('actual native private App JWT/current producer observations compose without granting writes',async()=>{
 const {proposerFixture}=await import('./proposer-provider-fixture.mjs');const {createFoottraceProposerReader}=await import('../../src/propose/current-proposer.mjs');
 const provider=proposerFixture(),f=fixture();f.inputs.currentSource.commit.sha=provider.context.sha;f.readers.readCurrentProposer=createFoottraceProposerReader(provider);
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.backend.currentProposer.identity.botId,500);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.proposerIdentity,true);assert.equal(r.record.snapshot.sharedState.proposeResult.facts.writerCredentialBindingAdmitted,false);
 assert.equal(r.report.authorized,false);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(JSON.stringify(r).includes('PRIVATE KEY'),false);
});

test('current archive joins exact prepared source/tree and actual proposer identity in the native record',async()=>{
 const r=await runProposeInspection(fixture());assert.equal(r.status,'inspection-only');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.currentPreparation,true);
 assert.equal(r.backend.currentPreparation.reference.artifactId,800);assert.equal(r.report.authorized,false);assert.equal(JSON.stringify(r.record).includes(secret),false);
});
for(const [name,change] of [['source',v=>v.sourceSha='f'.repeat(40)],['target tree',v=>v.targetTree='f'.repeat(40)],['prepare job',v=>v.jobId=999],['proposer digest',v=>v.proposerDigest='0'.repeat(64)]]){
 test('current archive '+name+' substitution holds the native inspection',async()=>{
  const f=fixture(),read=f.readers.readCurrentPreparation;f.readers.readCurrentPreparation=async(...args)=>{const r=await read(...args);change(r.reference);return r;};
  assert.equal((await runProposeInspection(f)).status,'held');
 });
}
test('current native archive refusal remains finite saved evidence',async()=>{
 const f=fixture();f.readers.readCurrentPreparation=async()=>({valid:false,nativeReason:'artifact-source',privateBody:secret});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.currentPreparationNativeReason,'artifact-source');assert.equal(r.backend,null);assert.equal(JSON.stringify(r).includes(secret),false);
});
test('current archive cannot promote writer authority',async()=>{
 const f=fixture(),read=f.readers.readCurrentPreparation;f.readers.readCurrentPreparation=async(...args)=>({...await read(...args),writerCredentialBindingAdmitted:true});
 assert.equal((await runProposeInspection(f)).status,'held');
});

test('native ordinary input discovery executes pinned whole Git/source guards within the shared flow',async()=>{
 const {ordinaryFixture}=await import('./ordinary-provider-fixture.mjs');const {createFoottraceOrdinaryPreparationReader}=await import('../../src/propose/foottrace-ordinary-preparation.mjs');
 const provider=ordinaryFixture(),f=fixture();f.inputs.currentSource=provider.currentSource;f.inputs.pending=provider.pending;f.readers.readOrdinaryPreparation=createFoottraceOrdinaryPreparationReader(provider);
 const r=await runProposeInspection(f);assert.equal(r.status,'inspection-only');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.ordinaryPreparation,true);
 assert.equal(r.backend.ordinaryPreparation.references.length,2);assert.ok(provider.calls.some(path=>path.includes('/git/trees/')));assert.equal(r.report.authorized,false);
});
for(const [name,change] of [['pending tree',r=>r.references[0].targetTree='f'.repeat(40)],['current queue',r=>r.references.at(-1).queueDigest='f'.repeat(64)],['current preparation',r=>r.references.at(-1).preparationDigest='f'.repeat(64)],['missing original source',r=>r.references.shift()],['preparation kind',r=>r.preparationKind='recovery']]){
 test('native ordinary '+name+' substitution holds before predecessor/network stages',async()=>{
  const f=fixture(),read=f.readers.readOrdinaryPreparation;f.readers.readOrdinaryPreparation=async p=>{const r=await read(p);change(r);return r;};
  const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.deepEqual(f.calls,['ordinary']);assert.equal(r.backend,null);
 });
}
test('native ordinary recovery refusal is retained as finite saved evidence',async()=>{
 const f=fixture();f.readers.readOrdinaryPreparation=async()=>({valid:false,reason:'ordinary-active-recovery',nativeReason:'recovery-intent',privateBody:secret});
 const r=await runProposeInspection(f);assert.equal(r.status,'held');assert.equal(r.record.snapshot.sharedState.proposeResult.facts.ordinaryReason,'ordinary-active-recovery');assert.equal(JSON.stringify(r).includes(secret),false);
});

async function retainedInspection(change=()=>{}) {
 const {retainedAttemptFixture}=await import('./retained-attempt-provider-fixture.mjs'),provider=await retainedAttemptFixture({change}),f=fixture();
 f.inputs.currentSource.commit.sha=provider.prepared.sourceSha;
 f.readers.readWorkflows=async()=>provider.collection;f.readers.readRetainedVersions=async()=>provider.versions;f.readers.readCurrentProposer=async()=>provider.current;
 return {f,provider};
}
test('native retained workflow/source/current identity classification is recorded without granting full eligibility',async()=>{
 const {f}=await retainedInspection(),r=await runProposeInspection(f);
 assert.equal(r.status,'inspection-only');assert.equal(r.report.retainedAttemptsEligible,true);assert.equal(r.report.eligibilityAdmitted,false);assert.equal(r.report.authorized,false);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.retainedAttemptsEligible,true);assert.equal(r.backend.retainedAttempts.current.runId,500);
 assert.equal(JSON.stringify(r).includes('PRIVATE-RETAINED-ATTEMPT-INPUT'),false);
});
test('a retained nonterminal hold is saved separately from read-only input knowledge',async()=>{
 const {f}=await retainedInspection((d,p)=>{if(p.includes('/runs/100/')&&d.jobs){d.jobs[0].status='in_progress';d.jobs[0].conclusion=null;}});
 const r=await runProposeInspection(f);assert.equal(r.report.retainedAttemptsEligible,false);assert.equal(r.report.eligibilityAdmitted,false);
 assert.equal(r.record.snapshot.sharedState.proposeResult.facts.retainedAttemptsReason,'retained-native-nonterminal');
});
test('an unavailable retained profile cannot silently select a package default',async()=>{
 const {f}=await retainedInspection();delete f.retainedProfile;const r=await runProposeInspection(f);
 assert.equal(r.report.retainedAttemptsEligible,false);assert.equal(r.record.snapshot.sharedState.proposeResult.facts.retainedAttemptsReason,'retained-attempts-unavailable');
});
