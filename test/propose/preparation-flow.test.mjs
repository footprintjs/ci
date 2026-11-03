import test from 'node:test';
import assert from 'node:assert/strict';
import { runProposePreparation } from '../../src/propose/preparation-flow.mjs';
import { explainReleaseRecord } from '../../src/record.mjs';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { sourceFixture } from './prepared-fixtures.mjs';

function fixture() {
  const source = sourceFixture(), row = source.inventory.get('.changes/first.md');
  // Fixed private note already in the actual raw queue, never meant for scope.
  const secret = 'PRIVATE-PREPARED-NOTE-DO-NOT-RECORD';
  row.bytes = Buffer.from(row.bytes.toString().replace('First fixture change.', secret));
  return { source, secret };
}
async function validRun(extra = {}) {
  const { createRequire } = await import('node:module'), require = createRequire(import.meta.url);
  const preparation = require('../../src/guards/release-prepare.cjs');
  const { source, secret } = fixture(), row = source.inventory.get('.changes/first.md');
  row.sha = preparation.gitObject('blob', row.bytes); source.commit.tree.sha = preparation.treeOid(source.inventory);
  const witness = preparationWitnessFixture(p => p, source);
  const inputs = { pending: { witnesses: [witness], predecessor: witness.predecessor }, currentSource: source,
    currentPreparationDate: null };
  return { result: await runProposePreparation({ profile: createFoottracePreparationProfile(), inputs, ...extra }), secret };
}
test('native flow records prepared-input facts and its decision without granting eligibility or authority', async () => {
  const { result } = await validRun();
  assert.equal(result.status, 'prepared-inputs-only'); assert.equal(result.record.complete, true);
  assert.equal(result.report.authorized, false); assert.equal(result.report.executedWrites, 0);
  assert.equal(result.report.identical, true); assert.equal(result.backend.valid, true);
});
test('saved native record can explain its prepared-input result without rerunning the preparer', async () => {
  const base = createFoottracePreparationProfile(); let calls = 0;
  const profile = { ...base, prepare: input => { calls++; return base.prepare(input); } };
  const { result } = await validRun({ profile }); const saved = JSON.parse(JSON.stringify(result.record));
  assert.ok(calls > 0); const before = calls;
  const explanation = explainReleaseRecord(saved, 'proposeResult');
  assert.match(explanation, /proposeInputFacts|propose-inputs|prepared/i);
  assert.doesNotMatch(explanation, /Incomplete native|Unreadable native|Unsupported release/);
  assert.equal(calls, before);
});
test('scope retains bounded producer/preparation references and keeps published L separate from pending P', async () => {
  const { result } = await validRun();
  const refs = result.record.snapshot.sharedState.proposePreparationRefs;
  assert.ok(Array.isArray(refs));
  assert.equal(refs.length, 1); assert.equal(refs[0].producer.runId, 456);
  assert.equal(refs[0].sourceSha, 'a'.repeat(40)); assert.equal(refs[0].pendingSha, 'c'.repeat(40));
  assert.equal(refs[0].predecessorRef.head, '1'.repeat(40));
  assert.equal(refs[0].publishedLineageAdmitted, false);
  assert.equal(result.record.snapshot.sharedState.proposeResult.facts.count, 1);
});
test('private prepared values remain backend-only in the native record and report', async () => {
  const { result, secret } = await validRun();
  assert.equal(result.record.complete, true);
  assert.equal(JSON.stringify({ record: result.record, report: result.report }).includes(secret), false);
  assert.equal(JSON.stringify(result.backend).includes(secret), true);
});
test('unavailable inputs take the native hold branch with bounded evidence', async () => {
  const result = await runProposePreparation({ profile: createFoottracePreparationProfile(), inputs: {} });
  assert.equal(result.status, 'held'); assert.equal(result.record.complete, true);
  assert.equal(result.report.authorized, false); assert.equal(result.backend, null);
});
test('record byte exhaustion is incomplete, even if pure preparation succeeded', async () => {
  const { result } = await validRun({ recordLimitBytes: 256 });
  assert.equal(result.status, 'incomplete'); assert.equal(result.record.complete, false);
  assert.equal(result.backend, null);
});
