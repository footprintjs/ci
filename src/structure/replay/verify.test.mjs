import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyMerge } from './index.mjs';
import { fixture, ids, raw, entry } from './testing.fixture.mjs';

function observe(input) {
  const result = verifyMerge(input);
  assert.ok(result && result.coverage && Array.isArray(result.findings), 'missing merge observation');
  return result;
}
function conflicted() {
  const input = fixture(); input.replay.mergeTree = raw(1, `${ids.tree}\0src/left.ts\0`);
  input.head.tree = ids.different;
  input.head.entries = [entry('src/left.ts', ids.changed), entry('src/right.ts')];
  return input;
}

test('clean exact replay yields a JSON-only complete advisory observation', () => {
  const result = observe(fixture());
  assert.equal(result.verification, 'merge'); assert.equal(result.headId, ids.head);
  assert.equal(result.replay.status, 'clean'); assert.equal(result.replay.gitVersion, 'git version 2.50.1');
  assert.deepEqual(result.findings, []); assert.equal(result.coverage.complete, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
test('clean merge tree inequality is a finding even if supplied leaves are equal', () => {
  const input = fixture(); input.head.tree = ids.different;
  assert.ok(observe(input).findings.some(item => item.rule === 'merge-tree'));
});
test('exact conflict path resolution is permitted', () => {
  const result = observe(conflicted());
  assert.deepEqual(result.findings, []); assert.equal(result.coverage.complete, true);
  assert.deepEqual(result.differences.map(item => item.path), ['src/left.ts']);
});
for (const kind of ['content', 'mode', 'delete', 'add', 'prefix']) test(`outside conflict ${kind} is a finding`, () => {
  const input = conflicted();
  if (kind === 'content') input.head.entries[1] = entry('src/right.ts', ids.changed);
  if (kind === 'mode') input.head.entries[1] = entry('src/right.ts', ids.blob, '100755');
  if (kind === 'delete') input.head.entries.pop();
  if (kind === 'add' || kind === 'prefix') input.head.entries.push(entry(kind === 'add' ? 'src/new.ts' : 'src/left.ts.extra'));
  assert.ok(observe(input).findings.some(item => item.rule === 'merge-conflict-scope'));
});
test('conflict exit with tree but no paths is incomplete even when tree IDs match', () => {
  const input = fixture(); input.replay.mergeTree = raw(1, `${ids.tree}\0`);
  const result = observe(input); assert.equal(result.coverage.complete, false);
  assert.ok(result.coverage.unverified.some(item => item.kind === 'merge-conflicts'));
});
test('octopus scope returns incomplete without parsing absent replay output', () => {
  const input = fixture(); input.head.parents.push('8'.repeat(40));
  delete input.replay.mergeTree; delete input.replay.entries;
  const result = observe(input); assert.equal(result.replay.status, 'not-replayed');
  assert.equal(result.coverage.complete, false);
});
test('inconsistent equal-tree entry data is a tool/input error', () => {
  const input = fixture(); input.head.entries = [entry('src/left.ts', ids.changed), entry('src/right.ts')];
  assert.throws(() => verifyMerge(input), /entries|tree/i);
});
test('empty-tree entries cannot hide nonconflict additions', () => {
  const input = conflicted(); input.head.entries.push(entry('empty', ids.blob, '040000', 'tree'));
  assert.ok(observe(input).findings.some(item => item.rule === 'merge-conflict-scope' && item.path === 'empty'));
});
test('attribute uncertainty skips absent native replay data', () => {
  const input = fixture();
  input.head.attributeTrees[0].files.push({ path: '.gitattributes', mode: '100644', text: '*.ts merge=text' });
  delete input.replay.mergeTree; delete input.replay.entries;
  const result = observe(input);
  assert.equal(result.replay.status, 'not-replayed');
  assert.ok(result.coverage.unverified.some(item => item.kind === 'merge-attributes'));
});
test('uniform SHA256 object identities use the same finite protocol', () => {
  const input = fixture();
  input.head.id = '1'.repeat(64); input.head.parents = ['2'.repeat(64), '3'.repeat(64)];
  input.head.tree = '4'.repeat(64);
  input.head.entries = input.head.entries.map(value => ({ ...value, oid: '6'.repeat(64) }));
  input.head.attributeTrees = [input.head.id, ...input.head.parents].map(id => ({ id, files: [] }));
  input.replay.entries = input.head.entries; input.replay.mergeTree = raw(0, `${input.head.tree}\0`);
  const result = observe(input);
  assert.equal(result.coverage.complete, true); assert.deepEqual(result.findings, []);
});
