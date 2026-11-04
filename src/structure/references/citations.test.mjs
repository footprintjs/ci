import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReferences, referenceTarget, historicalPath } from './citations.mjs';

test('explicit owners and finite recursive globs refer only to tracked paths', () => {
  const files = new Map([['src/a.ts', {}], ['src/deep/b.ts', {}]]);
  const [reference] = extractReferences('See `src/a.ts` · `work`.');
  assert.equal(reference.symbol, 'work');
  assert.deepEqual(referenceTarget({ target: 'src/**/*.ts' }, 'docs/guide.md', files).paths, ['src/a.ts', 'src/deep/b.ts']);
  assert.equal(historicalPath('docs/design/2026-10-old.md'), true);
  assert.equal(historicalPath('docs/design/current.md'), false);
});

test('unique basename citations retain line anchors as location rather than filename text', () => {
  const [reference] = extractReferences('See `owner.ts:12` · `work`.');
  assert.ok(reference);
  assert.deepEqual(referenceTarget(reference, 'docs/guide.md', new Map([['src/owner.ts', {}]])).paths, ['src/owner.ts']);
});

test('a wrapped JSDoc owner keeps its symbol and original source offset', () => {
  const text = '/** Owner `src/old.ts`\n * · `moved` */';
  const [reference] = extractReferences(text);
  assert.equal(reference.symbol, 'moved');
  assert.equal(text.slice(reference.offset, reference.offset + reference.target.length), 'src/old.ts');
});

test('literal reader paths do not gain glob expansion or documentation anchors', () => {
  const files = new Map([['src/a.ts', {}], ['src/a#note.ts', {}]]);
  assert.deepEqual(referenceTarget({ target: 'src/*.ts', exact: true }, 'test/read.ts', files).paths, []);
  assert.deepEqual(referenceTarget({ target: 'src/a#note.ts', exact: true }, 'test/read.ts', files).paths, ['src/a#note.ts']);
});
