import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkFileSizes } from '../../src/file-size/policy.mjs';

const baseline = (files = {}, exclude = []) => ({ files, exclude });
const run = (files, current, previous = baseline(), before = files) =>
  checkFileSizes({ files, baseline: current, previous, before });
const has = (result, text) => assert.ok(result.errors.some((error) => error.includes(text)), JSON.stringify(result));

test('new source over 600 lines is refused with path and measured limit', () => {
  const result = run({ 'src/new.ts': 601 }, baseline());
  has(result, 'src/new.ts: 601 > 600');
});
test('an existing oversized source may not grow', () => {
  has(run({ 'src/old.ts': 702 }, baseline({ 'src/old.ts': 700 }), baseline({ 'src/old.ts': 700 })), 'src/old.ts: 702 > 700');
});
const notes = (result, text) => assert.ok(result.notes.some((note) => note.includes(text)), JSON.stringify(result));
const clean = (result) => assert.deepEqual(result.errors, [], JSON.stringify(result));
const old = baseline({ 'src/old.ts': 700 });
test('shrinking to the limit passes without a baseline edit, and the stale entry is only a note', () => {
  const result = run({ 'src/old.ts': 600 }, old, old, { 'src/old.ts': 700 });
  clean(result);
  notes(result, 'src/old.ts: baseline entry can be removed');
});
test('a stale entry admits nothing: a file at most 600 lines at base is held to 600', () => {
  has(run({ 'src/old.ts': 601 }, old, old, { 'src/old.ts': 600 }), 'src/old.ts: 601 > 600 lines');
});
test('ordinary and unchanged or tightened oversized files pass', () => {
  assert.deepEqual(run({ 'src/a.ts': 600, 'src/b.ts': 650 }, baseline({ 'src/b.ts': 650 }), baseline({ 'src/b.ts': 700 })).errors, []);
});
test('raising the baseline cannot hide growth', () => {
  has(run({ 'src/old.ts': 702 }, baseline({ 'src/old.ts': 702 }), baseline({ 'src/old.ts': 700 })), 'baseline increased');
});
test('adding a new oversized baseline entry cannot admit a new oversized source', () => {
  has(run({ 'src/new.ts': 601 }, baseline({ 'src/new.ts': 601 })), 'new baseline entry');
});
test('shrinking above 600 passes without a baseline edit, and the loose entry is only a note', () => {
  const result = run({ 'src/old.ts': 650 }, old, old, { 'src/old.ts': 700 });
  clean(result);
  notes(result, 'src/old.ts: baseline can be tightened to 650 (is 700)');
});
test('a shrink holds without an edit: the measured base is the cap when it is below the stored ceiling', () => {
  has(run({ 'src/old.ts': 651 }, old, old, { 'src/old.ts': 650 }), 'src/old.ts: 651 > 650 lines at the base commit');
  clean(run({ 'src/old.ts': 650 }, old, old, { 'src/old.ts': 650 }));
});
test('a listed file that was at most 600 lines at base may grow back to 600, not past it', () => {
  clean(run({ 'src/old.ts': 600 }, old, old, { 'src/old.ts': 500 }));
});
test('an entry for an excluded path is still refused, so lifting the exclusion cannot admit the file', () => {
  const exclude = [{ path: 'src/gen/', reason: 'generated' }];
  const seeded = baseline({ 'src/gen/a.ts': 900 }, exclude);
  has(run({ 'src/gen/a.ts': 900 }, seeded, seeded), 'src/gen/a.ts: remove baseline entry (the path is excluded)');
});
test('the stored ceiling still holds when the base tree is larger than it', () => {
  has(run({ 'src/old.ts': 701 }, old, old, { 'src/old.ts': 705 }), 'src/old.ts: 701 > 700 lines');
});
test('a deleted source passes without a baseline edit, and cannot come back oversized through its old entry', () => {
  const deleted = baseline({ 'src/deleted.ts': 700 });
  const gone = run({}, deleted, deleted, { 'src/deleted.ts': 700 });
  clean(gone);
  notes(gone, 'src/deleted.ts: baseline entry can be removed');
  has(run({ 'src/deleted.ts': 700 }, deleted, deleted, {}), 'src/deleted.ts: 700 > 600 lines');
});
test('initial seed admits only existing oversized files, at their current size', () => {
  assert.deepEqual(run({ 'src/old.ts': 650 }, baseline({ 'src/old.ts': 650 }), null, { 'src/old.ts': 700 }).errors, []);
  has(run({ 'src/new.ts': 601 }, baseline({ 'src/new.ts': 601 }), null, {}), 'not oversized at base');
  has(run({ 'src/old.ts': 701 }, baseline({ 'src/old.ts': 701 }), null, { 'src/old.ts': 700 }), '701 > 700');
});
test('only explicit generated, vendored or test file/directory exclusions apply', () => {
  const exclude = [{ path: 'src/generated/', reason: 'generated' }, { path: 'src/vendor.ts', reason: 'vendored' }];
  const result = run({ 'src/generated/a.ts': 900, 'src/vendor.ts': 900, 'src/generated-lookalike/a.ts': 601 }, baseline({}, exclude), baseline({}, exclude));
  assert.equal(result.errors.length, 1);
  has(result, 'src/generated-lookalike/a.ts: 601 > 600');
});
test('later exclusions cannot silently widen the covered-source exception', () => {
  has(run({ 'src/a.ts': 900 }, baseline({}, [{ path: 'src/a.ts', reason: 'test' }])), 'new exclusion');
});
test('malformed or permissive baseline values are refused', () => {
  for (const value of [null, [], {}, { files: {}, exclude: [], maxLines: 900 }, baseline({ '../a': 700 }), baseline({ 'src/a.ts': 600 }), baseline({}, [{ path: 'src/', reason: 'generated' }]), baseline({}, [{ path: 'src/a.ts', reason: 'convenience' }])]) {
    assert.throws(() => run({}, value), /invalid file-size baseline/);
  }
});
