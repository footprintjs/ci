import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { releaseNotes, releaseTitle, writeNotes } from '../../src/release-route/notes.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { recordedGit } from './recorded-git.mjs';

const fixture = (path) => readFileSync(new URL(`fixtures/${path}`, import.meta.url));
const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
const storydeck = { 'package.json': fixture('storydeck-today/package.json'), 'CHANGELOG.md': fixture('storydeck-today/CHANGELOG.md'),
  '.github/release.json': fixture('family/storydeck.release.json') };
const code = (fn) => {
  try { fn(); } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'written';
};
const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-notes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('one title form: with the heading title, or the bare version', () => {
  assert.equal(releaseTitle('0.13.1', 'works beside footprintjs 12'), 'v0.13.1 \u{2014} works beside footprintjs 12');
  assert.equal(releaseTitle('4.1.0', ''), 'v4.1.0');
});

test('storydeck 0.13.1 at main today: title and notes from its CHANGELOG, written to two files', (t) => {
  const notes = releaseNotes({ git: recordedGit({ commit: COMMIT, files: storydeck }).git, commit: COMMIT });
  assert.equal(notes.title, 'v0.13.1 \u{2014} works beside footprintjs 12');
  assert.match(notes.lines[0], /^- \*\*The PowerPoint export works beside footprintjs 12\.\*\*/);
  const out = join(folder(t), 'notes');
  assert.deepEqual(writeNotes(out, notes), { titleFile: 'title.txt', notesFile: 'notes.md' });
  assert.equal(readFileSync(join(out, 'title.txt'), 'utf8'), 'v0.13.1 \u{2014} works beside footprintjs 12\n');
  assert.ok(readFileSync(join(out, 'notes.md'), 'utf8').endsWith('Nothing else changes.\n'));
});

test('keepachangelog without a title: the bare version', () => {
  const files = { 'package.json': Buffer.from('{"name":"hcifootprint","version":"4.1.0"}'), 'CHANGELOG.md': fixture('changelog/hcifootprint.md'),
    '.github/release.json': fixture('family/hcifootprint.release.json') };
  const notes = releaseNotes({ git: recordedGit({ commit: COMMIT, files }).git, commit: COMMIT });
  assert.equal(notes.title, 'v4.1.0');
  assert.equal(notes.lines[0], '### Added');
});

test('no section, no CHANGELOG, a prerelease or no settings: refused, nothing written', () => {
  const git = (files) => recordedGit({ commit: COMMIT, files }).git;
  const bump = { ...storydeck, 'package.json': Buffer.from('{"name":"footprint-storydeck","version":"0.13.2"}') };
  assert.equal(code(() => releaseNotes({ git: git(bump), commit: COMMIT })), 'changelog-missing 0.13.2');
  const { 'CHANGELOG.md': _, ...noLog } = storydeck;
  assert.equal(code(() => releaseNotes({ git: git(noLog), commit: COMMIT })), 'changelog-missing 0.13.1');
  const rc = { ...storydeck, 'package.json': Buffer.from('{"name":"footprint-storydeck","version":"0.14.0-rc.0"}') };
  assert.equal(code(() => releaseNotes({ git: git(rc), commit: COMMIT })), 'version-not-plain');
  const { '.github/release.json': __, ...noSettings } = storydeck;
  assert.equal(code(() => releaseNotes({ git: git(noSettings), commit: COMMIT })), 'settings-unreadable .github/release.json');
});

test('the notes folder must be absolute and empty; a link left there is never written through', (t) => {
  const notes = { title: 'v1.0.0', lines: ['- x'] };
  assert.equal(code(() => writeNotes('relative', notes)), 'output-folder not absolute');
  const used = folder(t);
  writeFileSync(join(used, 'notes.md'), 'old');
  assert.equal(code(() => writeNotes(used, notes)), 'output-folder not an empty folder');
  const fresh = join(folder(t), 'a');
  mkdirSync(fresh);
  writeNotes(fresh, notes);
  assert.equal(code(() => writeNotes(fresh, notes)), 'output-folder not an empty folder');
});
