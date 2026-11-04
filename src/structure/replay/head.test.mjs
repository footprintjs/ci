import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedHead, checkedAttributeTrees } from './head.mjs';
import { fixture } from './testing.fixture.mjs';

test('head object identity width and exact attribute labels are checked', () => {
  const { head } = fixture(); assert.equal(checkedHead(head), 40);
  assert.equal(checkedAttributeTrees(head), head.attributeTrees);
  head.parents[1] = 'a'.repeat(64); assert.throws(() => checkedHead(head));
});
test('duplicate parent and missing explicit attribute tree cannot pass', () => {
  const { head } = fixture(); head.parents[1] = head.parents[0]; assert.throws(() => checkedHead(head));
  const other = fixture().head; other.attributeTrees.pop(); assert.throws(() => checkedAttributeTrees(other));
});
