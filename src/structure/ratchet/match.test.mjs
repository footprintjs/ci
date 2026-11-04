import assert from 'node:assert/strict';
import test from 'node:test';
import { matchProfiles } from './match.mjs';
import { groupProfiles } from './profiles.mjs';
import { debt } from './index.fixture.mjs';

const match = (head, base) => matchProfiles(groupProfiles(head), groupProfiles(base));

test('two moved names sharing an identity retain distinct exact-body owners independent of order', () => {
  const oldA = debt({ unitId: 'old:a', path: 'src/a.ts', bodyHash: 'body-a' });
  const oldB = debt({ unitId: 'old:b', path: 'src/b.ts', bodyHash: 'body-b' });
  const headA = { ...oldA, unitId: 'new:a', path: 'src/moved-a.ts' };
  const headB = { ...oldB, unitId: 'new:b', path: 'src/moved-b.ts' };
  const result = match([headB, headA], [oldA, oldB]);
  assert.equal(result.pairs.length, 2);
  assert.ok(result.pairs.some(pair => pair.head.unitId === 'new:a' && pair.base.unitId === 'old:a'));
  assert.ok(result.pairs.some(pair => pair.head.unitId === 'new:b' && pair.base.unitId === 'old:b'));
  assert.deepEqual(result.ambiguous, []);
});

test('a duplicate unresolved identity does not allocate one old unit twice', () => {
  const result = match([debt({ unitId: 'new:a' }), debt({ unitId: 'new:b' })], [debt()]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.unmatchedHead.length, 2);
  assert.equal(result.ambiguous.length, 2);
});

test('a different runtime kind cannot borrow a same-spelled function owner', () => {
  const result = match([debt({ kind: 'class' })], [debt()]);
  assert.equal(result.pairs.length, 0);
});

test('file renames need an available exact whole-file hash', () => {
  const old = debt({ kind: 'file', rule: 'file-code-lines', value: 310, limit: 300,
    identity: 'file:src/old.ts', unitId: 'old:file', path: 'src/old.ts', bodyHash: 'whole-file' });
  const head = { ...old, identity: 'file:src/new.ts', unitId: 'new:file', path: 'src/new.ts' };
  assert.equal(match([head], [old]).pairs.length, 1);
  assert.equal(match([{ ...head, bodyHash: null }], [{ ...old, bodyHash: null }]).pairs.length, 0);
});
