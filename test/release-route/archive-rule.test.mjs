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
  ['non-ASCII', ['d\u{EF}st/'], 'archive-setting:entry-1'],
  ['two stars', ['*.*'], 'archive-setting:entry-1'],
  ['star in a folder segment', ['*/x.js'], 'archive-setting:entry-1'],
  ['star on a folder entry', ['dist*/'], 'archive-setting:entry-1'],
  ['globstar', ['dist/**'], 'archive-setting:entry-1'],
  ['brace', ['{a,b}.js'], 'archive-setting:entry-1'],
  ['duplicate', ['dist/', 'dist/'], 'archive-setting:entry-2'],
  ['too long', ['a'.repeat(201)], 'archive-setting:entry-1'],
])
  test(`the setting refuses ${label}`, () => assert.equal(code(() => compileArchiveRule(entries)), expected));

// B1 (second read of pull request 19): what NO setting may allow.
test('the fixed deny list is exactly these, so emptying or shrinking it turns this test red', () => {
  assert.deepEqual({ ...allowed.DENIED }, {
    rootFiles: ['binding.gyp', 'server.js', 'npm-shrinkwrap.json'], anyFiles: ['.npmrc'], anyFolders: ['node_modules'] });
});

test('each denied file or folder is refused whatever the setting admits, in any letter case', () => {
  const wide = compileArchiveRule(['dist/', '*.gyp', '*.js', '*.json', '*npmrc', 'lib/', 'x/']);
  for (const path of ['binding.gyp', 'BINDING.GYP', 'server.js', 'Server.JS', 'npm-shrinkwrap.json', '.npmrc', 'dist/.npmrc', 'lib/deep/.NPMRC',
    'dist/node_modules/evil/index.js', 'x/Node_Modules/a.js', 'lib/node_modules/a/b/c.js']) {
    assert.equal(wide.denied(path), true, path);
    assert.equal(wide.admits(path), false, path);
  }
  // Only the ROOT binding.gyp, server.js and npm-shrinkwrap.json mean something to npm.
  for (const path of ['dist/binding.gyp', 'lib/server.js', 'dist/npm-shrinkwrap.json', 'dist/node_modules.js', 'x/npmrc'])
    assert.equal(wide.admits(path), true, path);
});

for (const [label, entries] of [
  ['a bare *', ['*']],
  ['node_modules/', ['node_modules/']],
  ['a folder below node_modules', ['dist/node_modules/x/']],
  ['a file in node_modules', ['node_modules/x.js']],
  ['binding.gyp', ['binding.gyp']],
  ['server.js', ['server.js']],
  ['npm-shrinkwrap.json', ['npm-shrinkwrap.json']],
  ['.npmrc', ['.npmrc']],
  ['.npmrc in a folder', ['dist/.npmrc']],
  ['upper-case NODE_MODULES', ['NODE_MODULES/']],
])
  test(`the setting refuses an entry that names what no setting may allow: ${label}`, () =>
    assert.equal(code(() => compileArchiveRule(entries)), 'archive-setting:entry-1'));

test('an always-allowed file named as a folder is refused as a setting (npm then cannot read package.json)', () => {
  for (const entry of ['package.json/', 'README.md/', 'license/', 'Package.JSON/'])
    assert.equal(code(() => compileArchiveRule(['dist/', entry])), 'archive-setting:entry-2', entry);
});
