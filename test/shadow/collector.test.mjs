import test from 'node:test';
import assert from 'node:assert/strict';
import configData from '../../configs/foottrace.json' with { type: 'json' };
import { validateConfig } from '../../src/policy.mjs';
import { createFoottraceShadow, GUARD_SOURCE_SHA } from '../../src/shadow.mjs';
import { runReleaseFlow } from '../../src/flow.mjs';
const sha = 'a'.repeat(40), tree = 'b'.repeat(40), config = validateConfig(configData);
const transport = () => ({ api: async () => ({ data: { object: { sha } } }), fetcher() { throw Error('unexpected'); }, totals: () => ({ requests: 1, bytes: 1 }), observations: () => [] });
const fixtureGuard = (mode = 'verify') => ({ plan: async () => ({ mode, package: 'foottrace', repository: config.repository, version: '1.10.0', sha, tree }),
  runStage: async (stage, args) => {
    assert.equal(stage, 'verify'); assert.equal(args.env.APP_SLUG, config.app.slug);
    assert.throws(() => args.io.write('secret', Buffer.from('x')), { code: 'readonly-method' });
    return { verification: JSON.stringify({ state: 'verified', version: '1.10.0', sha, tree, sha256: 'c'.repeat(64), integrity: 'sha512-YWJjZA==', shasum: 'd'.repeat(40) }) };
  } });
test('fixture shadow invokes actual native seven-stage graph, verify-only never writes or republishes 1.10', async () => {
  const shadow = await createFoottraceShadow({ config, sourceSha: sha, transport: transport(), guard: fixtureGuard() });
  const result = await runReleaseFlow({ config, context: shadow.context, ports: shadow.ports });
  assert.equal(result.status, 'complete');
  assert.deepEqual(Object.keys(result.stages), ['plan','propose','verdict','authority','build','publish','verify']);
  assert.equal(result.stages.plan.reason, 'PLAN_VERIFY_ONLY');
  assert.equal(result.stages.publish.outcome, 'skip');
  assert.equal(result.stages.verify.reason, 'VERIFICATION_READY');
  assert.equal(result.stages.verify.facts.sha256, 'c'.repeat(64));
  assert.equal(result.record.complete, true);
  assert.equal(GUARD_SOURCE_SHA, 'f55250adcbe9bbfdde75b6bc2c889bac791ca131');
});
test('prepare is accurately would-write and holds without executing propose or any later backend effect', async () => {
  let verifies = 0;
  const guard = fixtureGuard('prepare'); guard.runStage = async () => { verifies++; throw Error('unexpected'); };
  const shadow = await createFoottraceShadow({ config, transport: transport(), guard });
  const result = await runReleaseFlow({ config, context: shadow.context, ports: shadow.ports });
  assert.equal(result.status, 'held'); assert.equal(result.stages.propose.outcome, 'would-write');
  assert.equal(result.stages.propose.reason, 'SHADOW_ONLY'); assert.equal(verifies, 0);
});
test('source mismatch and provider failures hold in a native record, never become absence', async () => {
  const guard = fixtureGuard();
  const shadow = await createFoottraceShadow({ config, sourceSha: 'f'.repeat(40), transport: transport(), guard });
  const result = await runReleaseFlow({ config, context: shadow.context, ports: shadow.ports });
  assert.equal(result.status, 'held'); assert.equal(result.stages.plan.reason, 'INVALID_EVIDENCE');
  assert.equal(result.record.complete, true); assert.equal(result.stages.verify, undefined);
});
test('registry byte verification failure never reports verification or executed writes', async () => {
  const guard = fixtureGuard(); guard.runStage = async () => { throw Object.assign(Error('secret /private/location'), { code: 'registry-bytes' }); };
  const shadow = await createFoottraceShadow({ config, transport: transport(), guard });
  const result = await runReleaseFlow({ config, context: shadow.context, ports: shadow.ports });
  assert.equal(result.status, 'held'); assert.equal(result.stages.verify.outcome, 'hold');
  assert(!JSON.stringify(result).includes('private/location'));
});
test('pinned production helper performs real fixture source/history and registry-byte verification in native flow', async () => {
  const { managedReleaseFixture } = await import('../upstream/test/release/helpers.mjs');
  const fixture = managedReleaseFixture({ published: true });
  fixture.context.sha = fixture.originalMerge;
  const fixtureConfig = validateConfig({ ...configData, repository: fixture.repository, app: fixture.options.settings });
  let registryReads = 0;
  const readTransport = { api: async (method, ...rest) => { assert.equal(method, 'GET'); return fixture.api(method, ...rest); },
    fetcher: async (...args) => { registryReads++; return fixture.fetcher(...args); },
    totals: () => ({ requests: fixture.calls.length + registryReads, bytes: 0 }), observations: () => [] };
  const shadow = await createFoottraceShadow({ config: fixtureConfig, transport: readTransport });
  const result = await runReleaseFlow({ config: fixtureConfig, context: shadow.context, ports: shadow.ports });
  assert.equal(result.status, 'complete');
  assert.equal(result.stages.verify.reason, 'VERIFICATION_READY');
  assert(registryReads >= 6); assert(fixture.calls.some((item) => item.route.includes('/git/blobs/')));
  assert(fixture.calls.every((item) => item.method === 'GET'));
});
test('local trial evidence identifies local invocation and never invents a GitHub run ID', async () => {
  const shadow = await createFoottraceShadow({ config, transport: transport(), guard: fixtureGuard() });
  assert.equal(shadow.context.invocation, 'local');
  assert.equal(shadow.context.runId, undefined); assert.equal(shadow.context.runAttempt, undefined);
});
test('Actions observations bind validated actual run, attempt, event and source identities', async () => {
  let backend;
  const guard=fixtureGuard();const plan=guard.plan;guard.plan=async(api,context,...rest)=>{backend=context;return plan(api,context,...rest);};
  const invocation={kind:'github-actions',runId:789,runAttempt:3,eventName:'push',ref:'refs/heads/main'};
  const shadow=await createFoottraceShadow({config,sourceSha:sha,transport:transport(),guard,invocation});
  await shadow.ports.plan();
  assert.equal(shadow.context.invocation,'github-actions');assert.equal(shadow.context.runId,789);
  assert.equal(shadow.context.runAttempt,3);assert.equal(shadow.context.eventName,'push');
  assert.equal(backend.runId,789);assert.equal(backend.runAttempt,3);assert.equal(backend.eventName,'push');
  await assert.rejects(createFoottraceShadow({config,transport:transport(),invocation:{...invocation,runId:0}}));
  await assert.rejects(createFoottraceShadow({config,transport:transport(),invocation:{...invocation,eventName:'pull_request'}}));
});
test('verification requires matching native prior plan receipt before backend verification', async () => {
  let calls=0;
  const guard=fixtureGuard();const verify=guard.runStage;
  guard.runStage=async(...args)=>{calls++;return verify(...args);};
  const shadow=await createFoottraceShadow({config,sourceSha:sha,transport:transport(),guard});
  const planned=await shadow.ports.plan();
  for(const prior of [undefined,{}, {plan:{...planned,facts:{...planned.facts,headSha:'f'.repeat(40)}}},
    {plan:{...planned,facts:{...planned.facts,treeSha:'e'.repeat(40)}}},
    {plan:{...planned,facts:{...planned.facts,version:'1.9.0'}}},
    {plan:{...planned,facts:{...planned.facts,planMode:'publish'}}}]) {
    assert.equal((await shadow.ports.verify({prior})).outcome,'hold');
  }
  assert.equal(calls,0);
  assert.equal((await shadow.ports.verify({prior:{plan:planned}})).outcome,'pass');
  assert.equal(calls,1);
});
test('explicit verification request uses existing native verify route with queued fragments intact', async () => {
  const {managedReleaseFixture}=await import('../upstream/test/release/helpers.mjs');
  const fixture=managedReleaseFixture({published:true});
  const fixtureConfig=validateConfig({...configData,repository:fixture.repository,app:fixture.options.settings});
  const readTransport={api:async(method,...rest)=>{assert.equal(method,'GET');return fixture.api(method,...rest);},fetcher:fixture.fetcher,
    totals:()=>({requests:fixture.calls.length,bytes:0}),observations:()=>[]};
  const source=fixture.context.sha;
  const shadow=await createFoottraceShadow({config:fixtureConfig,sourceSha:source,transport:readTransport,verifyOnly:true});
  const result=await runReleaseFlow({config:fixtureConfig,context:shadow.context,ports:shadow.ports});
  assert.equal(result.status,'complete');assert.equal(result.stages.plan.reason,'PLAN_VERIFY_ONLY');
  assert.equal(result.stages.verify.reason,'VERIFICATION_READY');assert.equal(result.stages.publish.outcome,'skip');
  assert.equal(shadow.context.verifyOnlyRequested,true);assert.equal(fixture.context.sha,source);
  assert(fixture.calls.every(item=>item.method==='GET'));
  await assert.rejects(createFoottraceShadow({config,transport:transport(),verifyOnly:'true'}));
});
