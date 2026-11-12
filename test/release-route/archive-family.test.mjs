// The archive setting fits the family: the member lists of the four published tarballs
// (paths only, from the real files) pass with the settings written for each package, and the
// four ways a tarball goes wrong are each refused by name. The real tarballs are not committed;
// docs/RELEASE-ROUTE.md records the run of the inspector over them.
import assert from 'node:assert/strict';
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
