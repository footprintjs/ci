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
  assert.deepEqual(referenceTarget({ target: 'a.ts', exact: true }, 'test/read.ts', files).paths, []);
});

test('a shorthand subpath resolves only to a unique tracked source suffix', () => {
  const reference = { target: 'tools/tool.ts:12', symbol: 'work' };
  const files = new Map([['src/core/agent/tools/tool.ts', {}]]);
  assert.deepEqual(referenceTarget(reference, 'docs/guide.md', files).paths, ['src/core/agent/tools/tool.ts']);
  files.set('src/other/tools/tool.ts', {});
  assert.match(referenceTarget(reference, 'docs/guide.md', files).unverified ?? '', /ambiguous/i);
});

test('a missing shorthand root stays unknown while an explicit source path is missing', () => {
  const files = new Map();
  assert.match(referenceTarget({ target: 'tools/gone.ts', symbol: 'work' }, 'docs/guide.md', files).unverified ?? '', /root|missing/i);
  assert.deepEqual(referenceTarget({ target: 'src/tools/gone.ts', symbol: 'work' }, 'docs/guide.md', files).paths, []);
});

test('a nested package source-root citation does not become a false root-path finding', () => {
  const files = new Map([['docs-site/package.json', {}], ['docs-site/src/env.d.ts', {}]]);
  const reference = { target: 'src/env.d.ts', symbol: null };
  assert.match(referenceTarget(reference, 'docs-site/checks/README.md', files).unverified ?? '', /package|context/i);
  files.set('src/env.d.ts', {});
  assert.match(referenceTarget(reference, 'docs-site/checks/README.md', files).unverified ?? '', /package|context/i);
  assert.deepEqual(referenceTarget({ target: '../src/env.d.ts' }, 'docs-site/checks/README.md', files).paths,
    ['docs-site/src/env.d.ts']);
  assert.deepEqual(referenceTarget({ target: 'src/env.d.ts', exact: true }, 'test/read.ts', files).paths, ['src/env.d.ts']);
});
