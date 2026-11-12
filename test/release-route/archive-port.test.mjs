// The port: an intake folder holding exactly package.tgz, the source manifest as bytes, the
// planned version and the archive setting. Every way the files can be wrong is a named refusal.
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import port from '../../src/release-route/archive/check-archive.cjs';
import refusal from '../../src/release-route/archive/refusal.cjs';
import fixture from './archive/fixture.cjs';

const source = { name: 'footprint-example', version: '1.2.3' };
const sourceBytes = Buffer.from(JSON.stringify(source));
const bytes = fixture.pack({ ...source });
const refused = (fn) => {
  try { fn(); } catch (error) { return refusal.archiveRefusalCode(error) ?? `raw: ${error?.message}`; }
  return 'accepted';
};
function folder(t) {
  const dir = mkdtempSync(join(tmpdir(), 'route-port-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function intake(t, files = { 'package.tgz': bytes }) {
  const dir = join(folder(t), 'intake');
  mkdirSync(dir);
  for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, name), value);
  return dir;
}

test('an intake with exactly package.tgz passes and reports the file, name and integrity', (t) => {
  const dir = intake(t);
  const result = port.checkArchive(dir, sourceBytes, '1.2.3', ['dist/']);
  assert.equal(result.file, join(dir, 'package.tgz'));
  assert.equal(result.package, 'footprint-example');
  assert.match(result.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
});

test('the intake must be an absolute, real folder holding package.tgz and nothing else', (t) => {
  assert.equal(refused(() => port.checkArchive('relative/intake', sourceBytes, '1.2.3', ['dist/'])), 'archive-intake');
  assert.equal(refused(() => port.checkArchive(join(folder(t), 'absent'), sourceBytes, '1.2.3', ['dist/'])), 'archive-intake');
  assert.equal(refused(() => port.checkArchive(intake(t, { 'package.tgz': bytes, 'extra.txt': 'x' }), sourceBytes, '1.2.3', ['dist/'])), 'archive-intake');
  assert.equal(refused(() => port.checkArchive(intake(t, { 'other.tgz': bytes }), sourceBytes, '1.2.3', ['dist/'])), 'archive-intake');
  const real = intake(t);
  const link = join(folder(t), 'link');
  symlinkSync(real, link);
  assert.equal(refused(() => port.checkArchive(link, sourceBytes, '1.2.3', ['dist/'])), 'archive-intake');
});

test('package.tgz must be one regular, non-empty, unlinked file', (t) => {
  assert.equal(refused(() => port.checkArchive(intake(t, { 'package.tgz': '' }), sourceBytes, '1.2.3', ['dist/'])), 'archive-file');
  const outside = join(folder(t), 'outside.tgz');
  writeFileSync(outside, bytes);
  const viaSymlink = intake(t, {});
  symlinkSync(outside, join(viaSymlink, 'package.tgz'));
  assert.equal(refused(() => port.checkArchive(viaSymlink, sourceBytes, '1.2.3', ['dist/'])), 'archive-file');
  const viaHardLink = intake(t, {});
  linkSync(outside, join(viaHardLink, 'package.tgz'));
  assert.equal(refused(() => port.checkArchive(viaHardLink, sourceBytes, '1.2.3', ['dist/'])), 'archive-file');
  const folderNamed = intake(t, {});
  mkdirSync(join(folderNamed, 'package.tgz'));
  assert.equal(refused(() => port.checkArchive(folderNamed, sourceBytes, '1.2.3', ['dist/'])), 'archive-file');
});

test('the source manifest is strict JSON with a name and a version, and must carry the planned version', (t) => {
  const dir = intake(t);
  assert.equal(refused(() => port.checkArchive(dir, Buffer.from('{"name":"a","name":"a","version":"1.2.3"}'), '1.2.3', ['dist/'])), 'manifest-json:name');
  assert.equal(refused(() => port.checkArchive(dir, Buffer.from('{"version":"1.2.3"}'), '1.2.3', ['dist/'])), 'manifest-source:root');
  assert.equal(refused(() => port.checkArchive(dir, sourceBytes, '1.2.4', ['dist/'])), 'archive-version');
});

test('preparePublishDirectory makes an empty private folder outside the intake and the source', (t) => {
  const base = folder(t);
  const dir = intake(t);
  const target = join(base, 'publish');
  port.preparePublishDirectory(target, dir, folder(t));
  assert.equal(statSync(target).mode & 0o777, 0o700);
  assert.deepEqual(readdirSync(target), []);
  writeFileSync(join(target, 'x'), 'x');
  assert.equal(refused(() => port.preparePublishDirectory(target, dir, folder(t))), 'publish-directory');
  assert.equal(refused(() => port.preparePublishDirectory(join(dir, 'inside'), dir, base)), 'publish-directory');
  assert.equal(refused(() => port.preparePublishDirectory('relative', dir, base)), 'publish-directory');
});
