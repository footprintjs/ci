import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPendingPreparationChainReader } from '../../src/propose/pending-chain.mjs';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { zip } from './artifact-fixture.mjs';
const require = createRequire(import.meta.url), preparation = require('../../src/guards/release-prepare.cjs');
const read = createPendingPreparationChainReader(createFoottracePreparationProfile());

import {chainFixture,preparationFixtureMembers} from './pending-chain-provider-fixture.mjs';

test('binds one original and repeated pending preparations while keeping published L separate', () => {
  const f = chainFixture(), result = read(f);
  assert.equal(result.valid, true);
  assert.equal(result.scope, 'pending-chain-inputs-only');
  assert.equal(result.hops.length, 2);
  assert.equal(result.predecessor.head, f.predecessor.head);
  assert.equal(result.pendingSha, f.witnesses[1].pendingSource.commit.sha);
  assert.equal(result.hops[1].pendingParent, f.witnesses[0].pendingSource.commit.sha);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
});
test('admits exactly eight preparation witnesses', () => assert.equal(read(chainFixture(8)).valid, true));
function put(source, path, text) {
  const bytes = Buffer.from(text);
  source.inventory.set(path, { mode: '100644', sha: preparation.gitObject('blob', bytes), bytes });
}
test('admits an added minor fragment while preserving the original raw patch fragment', () => {
  const f = chainFixture(2, (source, i) => {
    if (i) put(source, '.changes/second.md', '---\ntype: added\nbump: minor\n---\n\n- New capability.\n');
  });
  const result = read(f); assert.equal(result.valid, true);
  assert.deepEqual(result.hops.map(h => h.binding.version), ['1.10.1', '1.11.0']);
});
test('holds a changed original raw fragment even when both prepared trees and archives independently bind', () => {
  const f = chainFixture(2, (source, i) => {
    if (i) put(source, '.changes/first.md', '---\ntype: fixed\nbump: patch\n---\n\n- Replaced old change.\n');
  });
  assert.equal(read(f).valid, false);
});
test('holds a removed original fragment replaced by a valid new one', () => {
  const f = chainFixture(2, (source, i) => {
    if (i) { source.inventory.delete('.changes/first.md');
      put(source, '.changes/second.md', '---\ntype: fixed\nbump: patch\n---\n\n- Replacement.\n'); }
  });
  assert.equal(read(f).valid, false);
});
test('holds a changed released base version even when the raw queue and each preparation independently bind', () => {
  const f = chainFixture(2, (source, i) => {
    if (i) for (const path of ['package.json', 'package-lock.json'])
      put(source, path, source.inventory.get(path).bytes.toString().replaceAll('1.10.0', '1.11.0'));
  });
  assert.equal(read(f).valid, false);
});
test('names the eight-hop bound instead of truncating or admitting a ninth witness', () => {
  const result = read(chainFixture(9)); assert.equal(result.valid, false);
  assert.equal(result.reason, 'pending-chain-hop-limit');
});
for (const [name, mutate] of [
  ['empty chain', f => { f.witnesses = []; }],
  ['missing pending parent', f => { f.witnesses[1].pendingSource.commit.parents.pop(); }],
  ['old pending confused with published L', f => { f.witnesses[1].pendingSource.commit.parents[1].sha = f.predecessor.head; }],
  ['changed published predecessor', f => { f.witnesses[1].predecessor.merge = 'f'.repeat(40); }],
  ['repeated pending identity', f => { f.witnesses[1].pendingSource.commit.sha = f.witnesses[0].pendingSource.commit.sha; }],
  ['ambiguous extra field', f => { f.currentHead = f.predecessor.head; }],
  ['one historical producer unavailable', f => { f.witnesses[1].evidence.run.status = 'in_progress'; }],
  ['one prepared tree unavailable', f => { f.witnesses[1].pendingSource.commit.tree.sha = 'f'.repeat(40); }],
]) test(`holds ${name}`, () => { const f = chainFixture(); mutate(f); assert.equal(read(f).valid, false); });
test('does not invoke a witness accessor', () => {
  const f = chainFixture(); let calls = 0;
  Object.defineProperty(f.witnesses, '1', { get() { calls++; throw new Error('do not call'); } });
  assert.equal(read(f).valid, false); assert.equal(calls, 0);
});
test('holds contradictory sources attributed to the same preparation run and attempt', () => {
  const f = chainFixture(), [first, second] = f.witnesses;
  second.evidence.expected.runId = first.evidence.expected.runId; second.evidence.run.id = first.evidence.run.id;
  second.evidence.job.run_id = first.evidence.run.id; second.evidence.artifact.workflow_run.id = first.evidence.run.id;
  const members = preparationFixtureMembers(second.evidence.archive); members.manifest.runId = first.evidence.run.id;
  second.evidence.archive = zip([['manifest.json', JSON.stringify(members.manifest) + '\n'],
    ['proposal.json', JSON.stringify(members.proposal) + '\n']]);
  assert.equal(read(f).valid, false);
});
