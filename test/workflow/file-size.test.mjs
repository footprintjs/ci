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
test('shrinking to the limit requires removing the old baseline entry', () => {
  has(run({ 'src/old.ts': 600 }, baseline({ 'src/old.ts': 700 }), baseline({ 'src/old.ts': 700 })), 'remove baseline');
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
test('shrinking above 600 must tighten the baseline to the measured size', () => {
  has(run({ 'src/old.ts': 650 }, baseline({ 'src/old.ts': 700 }), baseline({ 'src/old.ts': 700 })), 'tighten baseline to 650');
});
test('deleted source must leave the baseline', () => {
  has(run({}, baseline({ 'src/deleted.ts': 700 }), baseline({ 'src/deleted.ts': 700 })), 'remove baseline');
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
