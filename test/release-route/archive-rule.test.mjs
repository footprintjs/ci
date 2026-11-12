// The `archive` setting, defined exactly: folder (required, at least one file), wildcard
// (one name in the last segment, optional), file (required); package.json, README.md and
// LICENSE always allowed; everything else refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import allowed from '../../src/release-route/archive/allowed.cjs';
import refusal from '../../src/release-route/archive/refusal.cjs';

const { compileArchiveRule } = allowed;
const code = (fn) => {
  try { fn(); } catch (error) { return refusal.archiveRefusalCode(error); }
  return 'no refusal';
};

test('a folder entry admits any file below it and is required to hold one', () => {
  const rule = compileArchiveRule(['dist/']);
  for (const path of ['dist/a.js', 'dist/deep/b.d.ts', 'dist/.hidden']) assert.equal(rule.admits(path), true, path);
  for (const path of ['dist', 'dist/', 'distx/a.js', 'src/dist/a.js']) assert.equal(rule.admits(path), false, path);
  assert.deepEqual(rule.missing(['package.json']), ['dist/']);
  assert.deepEqual(rule.missing(['dist/a.js']), []);
});

test('a wildcard stands for one or more characters of one name in its last segment, and is optional', () => {
  const rule = compileArchiveRule(['*.d.ts', 'tools/*.py']);
  for (const path of ['index.d.ts', 'a.b.d.ts', 'tools/x.py']) assert.equal(rule.admits(path), true, path);
  for (const path of ['.d.ts', 'dist/index.d.ts', 'tools/sub/x.py', 'tools/.py', 'x.d.tsx', 'toolsx/a.py'])
    assert.equal(rule.admits(path), false, path);
  assert.deepEqual(rule.missing([]), []);
});

test('a file entry is exact and required', () => {
  const rule = compileArchiveRule(['CHANGELOG.md', 'site/public/deck-stage.js']);
  assert.equal(rule.admits('CHANGELOG.md'), true);
  assert.equal(rule.admits('changelog.md'), false);
  assert.equal(rule.admits('site/public/deck-stage.js'), true);
  assert.equal(rule.admits('site/public/other.js'), false);
  assert.deepEqual(rule.missing(['CHANGELOG.md']), ['site/public/deck-stage.js']);
});

test('package.json, README.md and LICENSE are always allowed, never required, never listed', () => {
  const rule = compileArchiveRule(['dist/']);
  for (const path of ['package.json', 'README.md', 'LICENSE']) assert.equal(rule.admits(path), true, path);
  for (const path of ['readme.md', 'LICENSE.md', 'AGENTS.md', '.npmrc']) assert.equal(rule.admits(path), false, path);
  for (const listed of ['package.json', 'README.md', 'LICENSE'])
    assert.equal(code(() => compileArchiveRule(['dist/', listed])), 'archive-setting:entry-2');
});

for (const [label, entries, expected] of [
  ['not a list', 'dist/', 'archive-setting:list'],
  ['empty list', [], 'archive-setting:list'],
  ['too many entries', Array.from({ length: 65 }, (_, i) => `f${i}`), 'archive-setting:list'],
  ['a number', [1], 'archive-setting:entry-1'],
  ['empty string', [''], 'archive-setting:entry-1'],
  ['absolute path', ['/dist/'], 'archive-setting:entry-1'],
  ['dot segment', ['./dist/'], 'archive-setting:entry-1'],
  ['dot-dot segment', ['dist/../x'], 'archive-setting:entry-1'],
  ['double slash', ['dist//x'], 'archive-setting:entry-1'],
  ['backslash', ['dist\\x'], 'archive-setting:entry-1'],
  ['space', ['my file'], 'archive-setting:entry-1'],
  ['non-ASCII', ['dïst/'], 'archive-setting:entry-1'],
  ['two stars', ['*.*'], 'archive-setting:entry-1'],
  ['star in a folder segment', ['*/x.js'], 'archive-setting:entry-1'],
  ['star on a folder entry', ['dist*/'], 'archive-setting:entry-1'],
  ['globstar', ['dist/**'], 'archive-setting:entry-1'],
  ['brace', ['{a,b}.js'], 'archive-setting:entry-1'],
  ['duplicate', ['dist/', 'dist/'], 'archive-setting:entry-2'],
  ['too long', ['a'.repeat(201)], 'archive-setting:entry-1'],
])
  test(`the setting refuses ${label}`, () => assert.equal(code(() => compileArchiveRule(entries)), expected));
