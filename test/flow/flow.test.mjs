import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConfig } from '../../src/policy.mjs';
import { runReleaseFlow, STAGES } from '../../src/flow.mjs';
import { captureRecord, publicFacts, explainReleaseRecord } from '../../src/record.mjs';

const configData = JSON.parse(readFileSync(new URL('../../configs/foottrace.json', import.meta.url), 'utf8'));
const config = validateConfig(configData);
const context = { mode: 'shadow', phase: 'control', repository: 'footprintjs/foottrace', headSha: 'a'.repeat(40), runId: 12, runAttempt: 1 };
const port = (outcome = 'pass', reason = 'PASS', facts = {}) => Object.assign(async () => ({ outcome, reason, facts }), { readOnly: true });
const ports = () => Object.fromEntries(STAGES.map(stage => [stage, port()]));
const nodes = root => !root ? [] : [root, ...Object.values(root).flatMap(v => v && typeof v === 'object' ? (Array.isArray(v) ? v.flatMap(nodes) : nodes(v)) : [])];

test('executes real native seven function/decision stages with tracked writer/read evidence', async () => {
  const p = ports();
  p.plan = port('pass', 'PLAN_READY', { digest: 'a'.repeat(64), complete: true });
  let observed;
  p.propose = Object.assign(async input => { observed = input.prior.plan; return { outcome: 'pass', reason: 'PROPOSAL_IDENTICAL', facts: { identical: true } }; }, { readOnly: true });
  const run = await runReleaseFlow({ config, context, ports: p });
  assert.equal(run.status, 'complete');
  assert.deepEqual(Object.keys(run.stages), STAGES);
  assert.equal(observed.facts.digest, 'a'.repeat(64));
  assert.equal(run.record.complete, true);
  assert.ok(run.record.snapshot.commitLog.length >= 7);
  const saved = JSON.stringify(run.record);
  for (const stage of STAGES) assert.ok(saved.includes(`${stage}-decision`));
  assert.ok(nodes(run.record.snapshot.executionTree).some(n => n.stageReads && Object.keys(n.stageReads).some(key => key.includes('plan'))));
  assert.ok(Array.isArray(run.record.snapshot.recorders));
  assert.ok(run.record.snapshot.recorders.find(row => row.id === 'control'));
  assert.equal(run.record.snapshot.capture.channels.control, 'captured');
  assert.ok(run.record.structure);
  const explanation = explainReleaseRecord(JSON.parse(saved), 'proposeResult');
  assert.match(explanation, /propose.*wrote: proposeResult/);
  assert.match(explanation, /plan.*via planResult/);
  const reads = run.record.snapshot.readSources.record.occurrences;
  assert.ok(reads.some(r => r.key === 'planOutcome' && r.runtimeStageId.startsWith('plan-decision#') && r.source.kind === 'committed'));

});

test('hold refuses subsequent ports; unknown failures are static and never reach SDK', async () => {
  const p = ports(); let called = 0;
  p.plan = Object.assign(async () => { throw new Error('TOKEN secret /Users/private/key'); }, { readOnly: true });
  p.propose = Object.assign(async () => { called++; return { outcome: 'pass', reason: 'PASS', facts: {} }; }, { readOnly: true });
  const run = await runReleaseFlow({ config, context, ports: p });
  assert.equal(run.status, 'held'); assert.equal(called, 0);
  assert.equal(run.stages.plan.reason, 'PORT_FAILURE');
  assert.doesNotMatch(JSON.stringify(run), /TOKEN|secret|\/Users|private\/key/);
});

test('shadow never invokes ports lacking explicit readOnly capability', async () => {
  const p = ports(); let called = 0;
  p.propose = async () => { called++; return { outcome: 'pass', reason: 'PASS', facts: {} }; };
  const run = await runReleaseFlow({ config, context, ports: p });
  assert.equal(called, 0);
  assert.equal(run.stages.propose.outcome, 'would-write');
  assert.equal(run.status, 'held');
});

test('verify-only plan traverses native skipped nodes and verifies without mutable ports', async () => {
  const p = ports(); const called = [];
  p.plan = port('verify-only', 'PLAN_VERIFY_ONLY');
  for (const s of STAGES.slice(1, -1)) p[s] = () => { throw new Error(`called ${s}`); };
  p.verify = Object.assign(async () => { called.push('verify'); return { outcome: 'pass', reason: 'VERIFICATION_READY', facts: {} }; }, { readOnly: true });
  const run = await runReleaseFlow({ config, context, ports: p });
  assert.equal(run.status, 'complete'); assert.deepEqual(called, ['verify']);
  for (const s of STAGES.slice(1, -1)) assert.equal(run.stages[s].outcome, 'skip');
  assert.ok(JSON.stringify(run.record.snapshot.executionTree).includes('publish-decision'));
});

test('public projection rejects secret/path/accessor/toJSON/arbitrary keys before capture', () => {
  let invoked = false;
  const value = { complete: true, digest: 'b'.repeat(64), token: 'secret', path: '/Users/private', reason: 'arbitrary secret', toJSON() { invoked = true; return 'secret'; } };
  Object.defineProperty(value, 'headSha', { enumerable: true, get() { invoked = true; return 'x'; } });
  const safe = publicFacts(value);
  assert.equal(invoked, false); assert.deepEqual(safe, { complete: true, digest: 'b'.repeat(64) });
});

test('oversize native record refuses whole record with honest bounded incomplete fallback', async () => {
  const run = await runReleaseFlow({ config, context, ports: ports(), recordLimitBytes: 512 });
  assert.equal(run.record.complete, false); assert.equal(run.record.reason, 'RECORD_TOO_LARGE');
  assert.equal(run.status, 'incomplete');
  assert.ok(Buffer.byteLength(JSON.stringify(run.record), 'utf8') <= 512);
  assert.equal(run.record.snapshot, undefined);
});

test('incomplete or killed record cannot claim complete', () => {
  const r = captureRecord({ snapshot: {}, structure: {}, completed: false, recordLimitBytes: 512 });
  assert.equal(r.complete, false); assert.equal(r.reason, 'RUN_INCOMPLETE');
});

test('stale caller scope/receipt never substitutes for fresh per-stage observation', async () => {
  let freshCalls = 0; const p = ports();
  p.authority = Object.assign(async ({ prior }) => {
    freshCalls++;
    assert.equal(prior.verdict.reason, 'PASS');
    return { outcome: 'hold', reason: 'REVIEW_REQUIRED', facts: { fresh: false } };
  }, { readOnly: true });
  p.publish = () => { throw new Error('mutable submission'); };
  const run = await runReleaseFlow({ config, context: { ...context, sharedState: { authorityResult: { outcome: 'pass' } }, receipt: { approved: true } }, ports: p });
  assert.equal(freshCalls, 1); assert.equal(run.status, 'held');
  assert.equal(run.stages.authority.reason, 'REVIEW_REQUIRED');
  assert.equal(run.stages.publish, undefined);
  assert.equal(run.record.snapshot.capture.boundary.status, 'failed');
});

test('unrecognized result outcome/reason and hostile returned values hold without echoing input', async () => {
  for (const raw of [
    { outcome: 'pass', reason: 'TOKEN /private/home' },
    { outcome: 'custom-secret', reason: 'PASS' },
    { outcome: 'hold', reason: 'REVIEW_REQUIRED', facts: { digest: 'secret', token: 'secret', path: '/private/home', complete: true, constructor: 'secret' } },
  ]) {
    const p = ports(); p.plan = Object.assign(async () => raw, { readOnly: true });
    const run = await runReleaseFlow({ config, context, ports: p });
    assert.equal(run.status, 'held');
    assert.doesNotMatch(JSON.stringify(run), /TOKEN|secret|\/private\/home/);
  }
});


test('native refusal code is retained but unknown refusal detail cannot leak', async () => {
  const p = ports();
  p.plan = port('hold', 'INVALID_EVIDENCE', { refusalCode: 'registry-conflict', path: '/Users/private', complete: false });
  const run = await runReleaseFlow({ config, context, ports: p });
  assert.equal(run.stages.plan.facts.refusalCode, 'registry-conflict');
  assert.deepEqual(publicFacts({ refusalCode: 'arbitrary secret' }), {});
});

test('record bound measures serialized UTF8 bytes rather than character count', () => {
  const record = captureRecord({ snapshot: { value: 'é'.repeat(260) }, structure: {}, completed: true, recordLimitBytes: 512 });
  assert.equal(record.complete, false);
  assert.equal(record.reason, 'RECORD_TOO_LARGE');
});


test('public flow refuses unapproved config, live mode, wrong phase and missing context before any port', async () => {
  for (const [input, reason] of [
    [{ config: undefined, context }, 'CONFIG_UNAPPROVED'],
    [{ config: { ...configData, token: 'SECRET /Users/private' }, context }, 'CONFIG_UNAPPROVED'],
    [{ config, context: { ...context, mode: 'live', token: 'SECRET /Users/private' } }, 'FLOW_CONTEXT_INVALID'],
    [{ config, context: { ...context, phase: 'publish' } }, 'FLOW_CONTEXT_INVALID'],
    [{ config, context: undefined }, 'FLOW_CONTEXT_INVALID'],
  ]) {
    let calls = 0;
    const p = Object.fromEntries(STAGES.map(stage => [stage, Object.assign(async () => { calls++; return { outcome: 'pass', reason: 'PASS', facts: {} }; }, { readOnly: true })]));
    const run = await runReleaseFlow({ ...input, ports: p });
    assert.equal(calls, 0);
    assert.equal(run.status, 'held');
    assert.equal(run.stages.plan.reason, reason);
    assert.deepEqual(Object.keys(run.stages), ['plan']);
    assert.equal(run.record.snapshot.capture.boundary.status, 'failed');
    assert.doesNotMatch(JSON.stringify(run), /SECRET|\/Users\/private|"mode":"live"|"phase":"publish"/);
  }
});

test('hostile input projection failures become static native holds before any port', async () => {
  let calls = 0;
  const hostile = new Proxy(context, { getOwnPropertyDescriptor(target, key) {
    if (key === 'repository') throw new Error('SECRET /Users/private/key');
    return Reflect.getOwnPropertyDescriptor(target, key);
  } });
  const p = ports(); p.plan = Object.assign(async () => { calls++; return { outcome: 'pass', reason: 'PASS', facts: {} }; }, { readOnly: true });
  const run = await runReleaseFlow({ config, context: hostile, ports: p });
  assert.equal(calls, 0); assert.equal(run.status, 'held');
  assert.equal(run.stages.plan.reason, 'FLOW_CONTEXT_INVALID');
  assert.doesNotMatch(JSON.stringify(run), /SECRET|\/Users\/private/);
});

test('explicit verify-only request remains visible in the saved native context', async () => {
  const run = await runReleaseFlow({ config, context: { ...context, verifyOnlyRequested: true }, ports: ports() });
  assert.equal(run.record.snapshot.sharedState.releaseContext.verifyOnlyRequested, true);
});

test('fixed native pending verification states retain their distinction in public facts', () => {
  for (const state of ['pending-release', 'pending-registry', 'pending-latest']) {
    assert.deepEqual(publicFacts({ state }), { state });
  }
  assert.deepEqual(publicFacts({ state: 'arbitrary SECRET /Users/private' }), {});
});
