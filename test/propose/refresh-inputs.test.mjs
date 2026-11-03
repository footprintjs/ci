import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRefreshInputReader } from '../../src/propose/refresh-inputs.mjs';
import { createFoottracePreparationProfile } from '../../src/propose/foottrace-profile.mjs';
import { preparationWitnessFixture } from './preparation-witness-fixture.mjs';
import { sourceFixture } from './prepared-fixtures.mjs';
const require = createRequire(import.meta.url), preparation = require('../../src/guards/release-prepare.cjs');
const read = createRefreshInputReader(createFoottracePreparationProfile());
function put(source, path, text) {
  const bytes = Buffer.from(text);
  source.inventory.set(path, { mode: '100644', sha: preparation.gitObject('blob', bytes), bytes });
}
function fixture(change = () => {}) {
  const w = preparationWitnessFixture(), currentSource = sourceFixture();
  currentSource.commit.sha = 'e'.repeat(40); change(currentSource);
  currentSource.commit.tree.sha = preparation.treeOid(currentSource.inventory);
  return { pending: { witnesses: [w], predecessor: w.predecessor }, currentSource, currentPreparationDate: null };
}
test('reconstructs the new complete tree from M and the grown raw queue, preserving P and L separately', () => {
  const f = fixture(s => put(s, '.changes/second.md', '---\ntype: added\nbump: minor\n---\n\n- New capability.\n'));
  const result = read(f); assert.equal(result.valid, true);
  assert.equal(result.scope, 'refresh-prepared-inputs-only');
  assert.equal(result.version, '1.11.0'); assert.equal(result.samePreparation, false);
  assert.equal(result.sourceSha, f.currentSource.commit.sha);
  assert.equal(result.pendingSha, f.pending.witnesses[0].pendingSource.commit.sha);
  assert.equal(result.predecessor.head, f.pending.predecessor.head);
  assert.deepEqual(result.proposedParents, [f.currentSource.commit.sha, result.pendingSha]);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
});
test('recognizes an exact already-prepared source without making an eligibility or metadata decision', () => {
  const f = fixture(); f.currentSource = f.pending.witnesses[0].originalSource;
  const result = read(f); assert.equal(result.valid, true); assert.equal(result.samePreparation, true);
  assert.equal(Object.hasOwn(result, 'action'), false);
});
test('changed source identity requires a new preparation identity even when the tree happens to match', () => {
  const result = read(fixture()); assert.equal(result.valid, true); assert.equal(result.samePreparation, false);
});
for (const [name, change] of [
  ['modified raw old fragment', s => put(s, '.changes/first.md', '---\ntype: fixed\nbump: patch\n---\n\n- Replaced.\n')],
  ['removed raw old fragment', s => { s.inventory.delete('.changes/first.md');
    put(s, '.changes/new.md', '---\ntype: fixed\nbump: patch\n---\n\n- New.\n'); }],
  ['changed base package version', s => {
    for (const path of ['package.json', 'package-lock.json'])
      put(s, path, s.inventory.get(path).bytes.toString().replaceAll('1.10.0', '1.11.0'));
  }],
]) test(`holds ${name}`, () => assert.equal(read(fixture(change)).valid, false));
test('refuses P substituted as the source main identity', () => {
  const f = fixture(); f.currentSource.commit.sha = f.pending.witnesses[0].pendingSource.commit.sha;
  assert.equal(read(f).valid, false);
});

test('all admitted pending versions remain separate from a newly grown minor target',()=>{
 const f=fixture(s=>put(s,'.changes/second.md','---\ntype: added\nbump: minor\n---\n\n- New capability.\n'));
 const r=read(f);assert.equal(r.valid,true);assert.equal(r.version,'1.11.0');assert.deepEqual(r.preparationRefs.map(ref=>ref.version),['1.10.1']);
});
