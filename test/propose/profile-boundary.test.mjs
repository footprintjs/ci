import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreparedSourceReader } from '../../src/propose/prepared-source.mjs';
import { createHistoricalPreparationReader } from '../../src/propose/historical-preparation.mjs';
import { createPendingPreparationChainReader } from '../../src/propose/pending-chain.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { prepareFixture, sourceFixture } from './prepared-fixtures.mjs';

// Synthetic declared adapter, not an implementation or proof of legacy AF admission.
// A real adapter must validate its OWN producer/artifact format before returning this shape.
function fixture(nativeDay) {
  const source = sourceFixture();
  if (nativeDay) source.commit.committer.date = nativeDay + 'T01:00:00Z';
  const old = preparationWitnessFixture(p => p, source); old.pendingSource.commit.parents.pop();
  const prepared = createPreparedSourceReader({ packageName: 'foottrace', dateLaw: 'source-committer-day', prepare: prepareFixture })(old.originalSource);
  if (nativeDay) old.originalSource.commit.committer.date = '2026-11-02T01:00:00Z';
  const evidence = { preparationDate: null, artifactDigest: 'f'.repeat(64), binding: { repositoryId: 123, runId: 456, runAttempt: 1, jobId: 789,
    artifactId: 900, sourceSha: old.originalSource.commit.sha, tree: old.originalSource.commit.tree.sha,
    package: 'foottrace', version: prepared.prepared.version }, prepared: prepared.prepared };
  let calls = 0;
  const profile = { id: 'synthetic-source-only-v1', packageName: 'foottrace', originalParentLaw: 'source-only', dateLaw: 'source-committer-day',
    prepare: prepareFixture, readHistoricalEvidence: input => { calls++; return { valid: true, ...input }; } };
  const input = { evidence, originalSource: old.originalSource, pendingSource: old.pendingSource, predecessor: old.predecessor };
  return { profile, input, calls: () => calls };
}
test('a declared source-only profile binds its native evidence without inventing a Foottrace ZIP or L parent', () => {
  const f = fixture(), result = createHistoricalPreparationReader(f.profile)(f.input);
  assert.equal(result.valid, true); assert.equal(f.calls(), 1);
  assert.equal(result.profileId, f.profile.id); assert.equal(result.pendingParent, null);
  assert.equal(Object.hasOwn(f.input.evidence, 'manifest'), false);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
});
test('a source-only profile refuses a manufactured published-predecessor parent', () => {
  const f = fixture(); f.input.pendingSource.commit.parents.push({ sha: f.input.predecessor.head });
  assert.equal(createHistoricalPreparationReader(f.profile)(f.input).valid, false);
});
test('a structurally shaped adapter receipt cannot replace original source/tree reconstruction', () => {
  const f = fixture(); f.input.evidence.prepared = { ...f.input.evidence.prepared, notes: 'substituted' };
  assert.equal(createHistoricalPreparationReader(f.profile)(f.input).valid, false);
});
test('an unsupported original parent profile is refused at construction', () => {
  const f = fixture(); f.profile.originalParentLaw = 'anything';
  assert.throws(() => createHistoricalPreparationReader(f.profile), /preparation-profile/);
});
test('a source-only original can extend through the same bounded two-parent refresh chain', () => {
  const first = fixture(), second = fixture();
  second.input.originalSource.commit.sha = 'e'.repeat(40);
  second.input.evidence.binding.sourceSha = second.input.originalSource.commit.sha;
  second.input.evidence.binding.runId++;
  second.input.pendingSource.commit.sha = 'd'.repeat(40);
  second.input.pendingSource.commit.parents = [{ sha: second.input.originalSource.commit.sha },
    { sha: first.input.pendingSource.commit.sha }];
  const result = createPendingPreparationChainReader(first.profile)({ witnesses: [first.input, second.input],
    predecessor: first.input.predecessor });
  assert.equal(result.valid, true); assert.equal(result.hops[0].pendingParent, null);
  assert.equal(result.hops[1].pendingParent, first.input.pendingSource.commit.sha);
});
test('an explicit native-evidence date law cannot silently inherit the source commit day', () => {
  const f = fixture(); f.profile.dateLaw = 'native-evidence-day';
  let read; assert.doesNotThrow(() => { read = createHistoricalPreparationReader(f.profile); });
  assert.equal(read(f.input).valid, false);
});
test('a declared native date can reconstruct a tree prepared on a different UTC day from source B', () => {
  const f = fixture('2026-11-03'); f.profile.dateLaw = 'native-evidence-day';
  f.input.evidence.preparationDate = '2026-11-03';
  let read; assert.doesNotThrow(() => { read = createHistoricalPreparationReader(f.profile); });
  assert.equal(read(f.input).valid, true);
});
for (const day of ['2026-02-30', '2026-11-03T00:00:00Z', '', 20261103])
  test(`a native date profile refuses a non-day witness ${JSON.stringify(day)}`, () => {
    const f = fixture('2026-11-03'); f.profile.dateLaw = 'native-evidence-day';
    f.input.evidence.preparationDate = day;
    assert.equal(createHistoricalPreparationReader(f.profile)(f.input).valid, false);
  });
test('a source date profile refuses an extra caller-supplied preparation day', () => {
  const f = fixture(); f.input.evidence.preparationDate = '2026-11-02';
  assert.equal(createHistoricalPreparationReader(f.profile)(f.input).valid, false);
});
test('profile construction never invokes an accessor supplied as an adapter port', () => {
  const f = fixture(); let calls = 0;
  Object.defineProperty(f.profile, 'readHistoricalEvidence', { get() { calls++; return () => assert.fail(); } });
  assert.throws(() => createHistoricalPreparationReader(f.profile), /preparation-profile/);
  assert.equal(calls, 0);
});
