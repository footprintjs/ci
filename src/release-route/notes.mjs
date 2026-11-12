// The GitHub release's title and notes for one version, from CHANGELOG.md at the planned commit,
// written to two files: notes.md for `gh release create --notes-file`, and title.txt for the
// title, which the workflow passes as ONE argument from an environment variable. Free text never
// travels as a step output and is never put into a shell string.
//
// One title form for every package (design question 1): "v0.13.1 — works beside footprintjs 12",
// or "v4.1.0" when the heading has no title.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { decodeChangelog, findSection, MAX_CHANGELOG_BYTES } from './changelog.mjs';
import { isPlainVersion } from './identity.mjs';
import { readPackage } from './observe.mjs';
import { readAtCommit } from './repo.mjs';
import { refuse } from './refusals.mjs';
import { MAX_SETTINGS_BYTES, readSettings, SETTINGS_PATH } from './settings.mjs';

export const TITLE_FILE = 'title.txt';
export const NOTES_FILE = 'notes.md';

export function releaseTitle(version, title) {
  return title ? `v${version} \u{2014} ${title}` : `v${version}`;
}

// { version, title, lines } for the commit; refuses when there is no section to write from.
export function releaseNotes({ git, commit }) {
  const settingsBytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
  if (settingsBytes === null) refuse('settings-unreadable', SETTINGS_PATH);
  const settings = readSettings(settingsBytes);
  const { manifest } = readPackage(git, commit);
  if (!isPlainVersion(manifest.version)) refuse('version-not-plain');
  const bytes = readAtCommit(git, commit, 'CHANGELOG.md', MAX_CHANGELOG_BYTES, 'changelog-unreadable');
  const section = bytes === null ? null : findSection(decodeChangelog(bytes), manifest.version, settings.changelog);
  if (section === null) refuse('changelog-missing', manifest.version);
  const lines = section.lines.length > 0 ? section.lines : ['No notes in CHANGELOG.md for this version.'];
  return { version: manifest.version, title: releaseTitle(manifest.version, section.title), lines };
}

// Writes the two files into `out` (absolute; absent or empty). 'wx' never overwrites and never
// writes through a link left in the folder.
export function writeNotes(out, { title, lines }) {
  if (typeof out !== 'string' || !isAbsolute(out)) refuse('output-folder', 'not absolute');
  mkdirSync(out, { recursive: true, mode: 0o700 });
  if (readdirSync(out).length !== 0) refuse('output-folder', 'not an empty folder');
  writeFileSync(join(out, TITLE_FILE), `${title}\n`, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(out, NOTES_FILE), `${lines.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  return { titleFile: TITLE_FILE, notesFile: NOTES_FILE };
}
