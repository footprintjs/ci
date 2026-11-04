import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGitSnapshot } from './index.mjs';

function repository(t) {
  const path = mkdtempSync(join(tmpdir(), 'structure-git-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(path, 'src'));
  writeFileSync(join(path, 'src/entry.ts'), 'export const answer = 1;\n');
  writeFileSync(join(path, 'image.bin'), Buffer.from([0xff, 0, 0xfe]));
  git('add', '.');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture');
  return { path, git };
}

test('Git snapshots read exact committed text and preserve path-only data assets', t => {
  const { path, git } = repository(t);
  writeFileSync(join(path, 'src/entry.ts'), 'UNCOMMITTED');
  let actual;
  assert.doesNotThrow(() => { actual = readGitSnapshot(path, 'HEAD'); });
  assert.equal(actual.id, git('rev-parse', 'HEAD'));
  assert.equal(actual.files.find(item => item.path === 'src/entry.ts').text, 'export const answer = 1;\n');
  const image = actual.files.find(item => item.path === 'image.bin');
  assert.equal(image.content, 'path-only');
  assert.match(image.oid, /^[a-f0-9]{40}$/);
});

test('inherited Git directory overrides cannot redirect the candidate read', t => {
  const { path, git } = repository(t);
  const expected = git('rev-parse', 'HEAD');
  const old = process.env.GIT_DIR;
  process.env.GIT_DIR = '/no/such/structure-git-dir';
  try { assert.equal(readGitSnapshot(path, 'HEAD').id, expected); }
  finally {
    if (old === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = old;
  }
});

test('missing revisions and option-shaped revisions are input failures', t => {
  const { path } = repository(t);
  assert.throws(() => readGitSnapshot(path, 'missing-ref'), /revision|commit/i);
  assert.throws(() => readGitSnapshot(path, '--help'), /revision|commit/i);
});
