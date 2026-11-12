// The archive setting fits the family: the member lists of the four published tarballs
// (paths only, from the real files) pass with the settings written for each package, and the
// four ways a tarball goes wrong are each refused by name. The real tarballs are not committed;
// docs/RELEASE-ROUTE.md records the run of the inspector over them.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import inspector from '../../src/release-route/archive/inspector.cjs';
import fixture from './archive/fixture.cjs';

const { inspectArchive, archiveRefusalCode } = inspector;
const family = ['storydeck', 'storyreel', 'hcifootprint', 'agentfootprint-lens'];
const read = (name) => JSON.parse(readFileSync(new URL(`fixtures/family/${name}`, import.meta.url), 'utf8'));

// A tarball with exactly these members, in this order; package.json carries the manifest.
function tarball(members, manifest) {
  return gzipSync(fixture.tar(members.map((path) =>
    fixture.entry(path, path === 'package/package.json' ? JSON.stringify(manifest) : `fixture ${path}\n`))));
}
function load(name) {
  const list = read(`${name}.members.json`);
  const settings = read(`${name}.release.json`);
  const manifest = { name: list.package, version: list.version };
  return { list, members: list.members, manifest, expected: { version: list.version, sourceManifest: manifest, archive: settings.archive } };
}
const refusedWith = (fn) => {
  try { fn(); } catch (error) { return archiveRefusalCode(error) ?? `raw: ${error?.message}`; }
  return 'accepted';
};

for (const name of family)
  test(`the ${name} member list passes with its settings`, () => {
    const { list, manifest, expected } = load(name);
    const result = inspectArchive(tarball(list.members, manifest), expected);
    assert.equal(result.package, list.package);
    assert.equal(result.files.length, list.members.length);
  });

test('the member lists are the real ones: counts and the shape the closed profile needs', () => {
  const counts = Object.fromEntries(family.map((name) => [name, read(`${name}.members.json`).members.length]));
  assert.deepEqual(counts, { storydeck: 81, storyreel: 365, hcifootprint: 419, 'agentfootprint-lens': 79 });
  for (const name of family)
    for (const path of read(`${name}.members.json`).members) assert.match(path, /^package\/[\x21-\x7e]{1,91}$/);
});

const storydeck = load('storydeck');
const { members, manifest, expected } = storydeck;
for (const [label, archive, code] of [
  ['one extra file', () => tarball([...members, 'package/notes.txt'], manifest), 'archive-path:package/notes.txt'],
  ['a missing required folder', () => tarball(members.filter((p) => !p.startsWith('package/plugin/')), manifest), 'archive-missing:plugin/'],
  ['a missing required file', () => tarball(members.filter((p) => p !== 'package/CHANGELOG.md'), manifest), 'archive-missing:CHANGELOG.md'],
  ['a wrong name', () => tarball(members, { ...manifest, name: 'footprint-other' }), 'manifest-source:name'],
  ['a wrong version', () => tarball(members, { ...manifest, version: '0.13.2' }), 'archive-version'],
])
  test(`storydeck: ${label} is refused as ${code}`, () => assert.equal(refusedWith(() => inspectArchive(archive(), expected)), code));

test('a publishConfig in the packed manifest is refused by name (agentfootprint-lens 0.81.0 has one today)', () => {
  const lens = load('agentfootprint-lens');
  const manifest = { ...lens.manifest, publishConfig: { access: 'public', provenance: true } };
  assert.equal(refusedWith(() => inspectArchive(tarball(lens.list.members, manifest), { ...lens.expected, sourceManifest: manifest })),
    'archive-publish-config');
});

test('B1: the reader\'s widened setting no longer admits binding.gyp, .npmrc, server.js or node_modules', () => {
  const extras = ['package/binding.gyp', 'package/.npmrc', 'package/server.js', 'package/node_modules/evil/index.js', 'package/npm-shrinkwrap.json'];
  for (const extra of extras) {
    const archive = tarball([...members, extra], manifest);
    for (const setting of [['dist/', 'plugin/', 'site/public/deck-stage.js', '*.d.ts', '*.css', 'CHANGELOG.md', '*.js', '*.gyp', '*.json', '*npmrc']])
      assert.equal(refusedWith(() => inspectArchive(archive, { ...expected, archive: setting })), `archive-denied:${extra}`);
  }
});

// B2 (second read, round 2): names a case-insensitive file system or Windows would merge.
const twinSource = { name: 'twin-demo', version: '1.0.0', description: 'clean' };
const twinManifest = JSON.stringify({ ...twinSource, description: 'TWIN', scripts: { install: 'node -e "require(\'fs\').writeFileSync(\'INSTALL-SCRIPT-RAN\',\'x\')"' } });
for (const [label, extra, setting, code] of [
  ['the reader\'s twin package/Package.json with an install script', ['package/Package.json', twinManifest], ['dist/', '*.json'], 'archive-name:package/Package.json'],
  ['PACKAGE.JSON under "*.JSON"', ['package/PACKAGE.JSON', twinManifest], ['dist/', '*.JSON'], 'archive-name:package/PACKAGE.JSON'],
  ['two files equal without case', ['package/dist/INDEX.js', 'x'], ['dist/'], 'archive-name:package/dist/INDEX.js'],
  ['binding.gyp. (Windows drops the dot)', ['package/binding.gyp.', 'x'], ['dist/', 'binding*'], 'archive-name:package/binding.gyp.'],
  ['"binding.gyp " (Windows drops the space)', ['package/binding.gyp ', 'x'], ['dist/', 'binding*'], 'archive-name:package/binding.gyp '],
  ['a folder segment ending in a dot', ['package/dist./x.js', 'x'], ['dist/'], 'archive-name:package/dist./x.js'],
])
  test(`B2: ${label} is refused in the profile, whatever the setting says`, () => {
    const bytes = fixture.pack(twinSource, [fixture.entry(...extra)]);
    assert.equal(refusedWith(() => inspectArchive(bytes, { version: '1.0.0', sourceManifest: twinSource, archive: setting })), code);
  });

test('B2: the twin is refused by the profile before any setting is asked (readArchiveMembers too)', () => {
  const bytes = fixture.pack(twinSource, [fixture.entry('package/Package.json', twinManifest)]);
  assert.equal(refusedWith(() => inspector.readArchiveMembers(bytes)), 'archive-name:package/Package.json');
});

// The same class, stated once (round 3): no member may have a name that some file system resolves
// to a different file than the one written. None of the four real tarballs, nor the vendored npm,
// uses "~", ":" or a device name, so the profile refuses them outright.
const hashed = (text) => `key-${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
for (const [label, member, setting, code] of [
  ['a Windows short name PACKAG~1.JSO', 'package/PACKAG~1.JSO', ['dist/', '*.JSO'], 'archive-name:package/PACKAG~1.JSO'],
  ['a "~" anywhere in a segment', 'package/dist/a~b.js', ['dist/'], 'archive-name:package/dist/a~b.js'],
  ['an alternate data stream package.json:x', 'package/package.json:x', ['dist/', 'package.json*'], `archive-name:${hashed('package/package.json:x')}`],
  ['a drive-like segment', 'package/dist/c:x.js', ['dist/'], `archive-name:${hashed('package/dist/c:x.js')}`],
  ['the device name CON', 'package/dist/CON', ['dist/'], 'archive-name:package/dist/CON'],
  ['a device name with an extension, lower case', 'package/con.js', ['dist/', '*.js'], 'archive-name:package/con.js'],
  ['Aux.d.ts in a folder', 'package/dist/Aux.d.ts', ['dist/'], 'archive-name:package/dist/Aux.d.ts'],
  ['COM1.txt', 'package/dist/COM1.txt', ['dist/'], 'archive-name:package/dist/COM1.txt'],
  ['lpt9 as a folder', 'package/dist/lpt9/x.js', ['dist/'], 'archive-name:package/dist/lpt9/x.js'],
  ['NUL with a space before the extension', 'package/dist/NUL .txt', ['dist/'], 'archive-name:package/dist/NUL .txt'],
  ['a backslash (already refused by the copied profile)', 'package/dist\\x.js', ['dist/'], 'invalid-archive'],
  ['a non-ASCII letter (already refused by the copied profile)', 'package/dist/\u{E9}.js', ['dist/'], 'archive-profile'],
  ['a Cyrillic look-alike of package.json (already refused)', 'package/p\u{430}ckage.json', ['dist/', '*.json'], 'archive-profile'],
])
  test(`names no archive may hold: ${label}`, () => {
    const bytes = fixture.pack(twinSource, [fixture.entry(member, 'x')]);
    assert.equal(refusedWith(() => inspectArchive(bytes, { version: '1.0.0', sourceManifest: twinSource, archive: setting })), code);
  });

test('names no archive may hold: ordinary names with dots, dashes and digits still pass', () => {
  const bytes = fixture.pack(twinSource, ['package/dist/console.js', 'package/dist/com10.js', 'package/dist/aux-data.json', 'package/dist/v1.2.3/x.js']
    .map((member) => fixture.entry(member, 'x')));
  assert.equal(inspectArchive(bytes, { version: '1.0.0', sourceManifest: twinSource, archive: ['dist/'] }).files.length, 6);
});

// Round 3 of the second read: one path as a FILE in one member and a FOLDER in another (npm keeps
// one and silently drops the other), and three more Windows device names.
test('a path that is a file in one member and a folder in another is refused, in either order and any case', () => {
  const manifest = fixture.entry('package/package.json', JSON.stringify(twinSource));
  for (const members of [
    [manifest, fixture.entry('package/dist/index.js', 'x'), fixture.entry('package/dist', 'FILE')],
    [manifest, fixture.entry('package/dist', 'FILE'), fixture.entry('package/dist/index.js', 'x')],
    [manifest, fixture.entry('package/dist/index.js', 'x'), fixture.entry('package/DIST', 'FILE')],
    [manifest, fixture.entry('package/Dist', 'FILE'), fixture.entry('package/dist/a/b.js', 'x')],
  ]) {
    const bytes = gzipSync(fixture.tar(members));
    assert.match(refusedWith(() => inspectArchive(bytes, { version: '1.0.0', sourceManifest: twinSource, archive: ['dist/', 'di*', 'Di*', 'DI*'] })), /^archive-name:package\//);
  }
});

for (const member of ['package/dist/CONIN$', 'package/dist/conout$.txt', 'package/dist/COM0', 'package/dist/lpt0.js'])
  test(`the device name ${member.split('/').at(-1)} is refused`, () => {
    const bytes = fixture.pack(twinSource, [fixture.entry(member, 'x')]);
    assert.equal(refusedWith(() => inspectArchive(bytes, { version: '1.0.0', sourceManifest: twinSource, archive: ['dist/'] })), `archive-name:${member}`);
  });
