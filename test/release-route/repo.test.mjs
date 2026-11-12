// The git questions against a real repository and a real (local, bare) origin: no network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { readAtCommit, requireCleanCheckout, tagExists } from '../../src/release-route/repo.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'route-repo-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'work');
  const run = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('git', ['init', '--quiet', '--bare', join(root, 'origin.git')]);
  mkdirSync(dir);
  run(dir, 'init', '--quiet', '-b', 'main');
  run(dir, 'config', 'user.name', 'Route test');
  run(dir, 'config', 'user.email', 'route@example.invalid');
  run(dir, 'remote', 'add', 'origin', join(root, 'origin.git'));
  writeFileSync(join(dir, 'package.json'), '{"name":"x","version":"1.0.0"}');
  mkdirSync(join(dir, '.github'));
  writeFileSync(join(dir, '.github/release.json'), '{}');
  symlinkSync('package.json', join(dir, 'linked.json'));
  run(dir, 'add', '.');
  run(dir, 'commit', '--quiet', '-m', 'start');
  run(dir, 'tag', 'v1.0.0');
  run(dir, 'push', '--quiet', 'origin', 'main', 'v1.0.0');
  const commit = run(dir, 'rev-parse', 'HEAD').toString().trim();
  const git = (args) => run(dir, ...args);
  return { dir, commit, git };
}
const code = (fn) => {
  try { fn(); } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'no refusal';
};

test('reads a committed blob at the commit, null for an absent path', (t) => {
  const { commit, git } = fixture(t);
  assert.equal(readAtCommit(git, commit, 'package.json', 1000, 'package-unreadable').toString(), '{"name":"x","version":"1.0.0"}');
  assert.equal(readAtCommit(git, commit, '.github/release.json', 1000, 'settings-unreadable').toString(), '{}');
  assert.equal(readAtCommit(git, commit, 'CHANGELOG.md', 1000, 'changelog-unreadable'), null);
});

test('a symlink, a folder or a blob over the bound is the caller\'s unreadable code', (t) => {
  const { commit, git } = fixture(t);
  assert.equal(code(() => readAtCommit(git, commit, 'linked.json', 1000, 'package-unreadable')), 'package-unreadable linked.json');
  assert.equal(code(() => readAtCommit(git, commit, '.github', 1000, 'settings-unreadable')), 'settings-unreadable .github');
  assert.equal(code(() => readAtCommit(git, commit, 'package.json', 5, 'package-unreadable')), 'package-unreadable package.json');
});

test('a commit that is not there, or a git that fails, is git-failed; a malformed commit never reaches git', (t) => {
  const { git } = fixture(t);
  assert.equal(code(() => readAtCommit(git, 'b'.repeat(40), 'package.json', 1000, 'package-unreadable')), 'git-failed ls-tree package.json');
  let called = false;
  assert.equal(code(() => readAtCommit(() => { called = true; }, 'HEAD', 'package.json', 1, 'x')), 'input-invalid commit');
  assert.equal(called, false);
});

test('the tag is asked of origin', (t) => {
  const { git } = fixture(t);
  assert.equal(tagExists(git, '1.0.0'), true);
  assert.equal(tagExists(git, '1.0.1'), false);
  assert.equal(code(() => tagExists(git, '1.0.0; rm -rf')), 'input-invalid version');
  assert.equal(code(() => tagExists(() => Buffer.from('x\trefs/tags/v1.0.0\n'), '1.0.0')), 'git-failed ls-remote tags');
  assert.equal(code(() => tagExists(() => { throw new Error('offline'); }, '1.0.0')), 'git-failed ls-remote tags');
});

test('build runs only on the planned commit with a clean tree', (t) => {
  const { dir, commit, git } = fixture(t);
  requireCleanCheckout(git, commit);
  assert.equal(code(() => requireCleanCheckout(git, 'c'.repeat(40))), 'checkout-mismatch HEAD is another commit');
  writeFileSync(join(dir, 'left-behind.txt'), 'x');
  assert.equal(code(() => requireCleanCheckout(git, commit)), 'checkout-mismatch the tree has changes');
});
