import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedObjectId, checkedPath, checkedRaw } from './grammar.mjs';
import { ids, raw } from './testing.fixture.mjs';

test('canonical grammar preserves unusual path bytes but rejects escapes and width mismatch', () => {
  assert.equal(checkedPath('-a\n"name'), '-a\n"name');
  assert.equal(checkedObjectId(ids.tree, 40), ids.tree);
  for (const path of ['', '/a', 'a//b', 'a/../b', 'a/./b', 'a\0b']) assert.throws(() => checkedPath(path));
  assert.throws(() => checkedObjectId(ids.tree, 64));
});
test('raw process observations require explicit integer status and well-formed text', () => {
  const value = raw(1, '', 'error'); assert.equal(checkedRaw(value), value);
  for (const value of [raw(null, ''), raw(0, '\ud800'), { exitCode: 0, stdout: '' }]) assert.throws(() => checkedRaw(value));
});
