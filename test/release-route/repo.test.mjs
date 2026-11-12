// The git questions against a real repository and a real (local, bare) origin: no network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { mainTip, readAtCommit, requireCleanCheckout, tagCommit, tagExists } from '../../src/release-route/repo.mjs';

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

test('an annotated tag is answered by its peeled commit; the tip of main is measured; odd answers are git-failed', (t) => {
  const { dir, commit, git } = fixture(t);
  execFileSync('git', ['-C', dir, 'tag', '-a', '-m', 'annotated', 'v2.0.0']);
  execFileSync('git', ['-C', dir, 'push', '--quiet', 'origin', 'v2.0.0']);
  assert.equal(tagCommit(git, '2.0.0'), commit);
  assert.equal(tagCommit(git, '1.0.0'), commit);
  assert.equal(tagCommit(git, '3.0.0'), null);
  assert.equal(mainTip(git), commit);
  const answer = (text) => () => Buffer.from(text);
  for (const text of [`${commit}\trefs/tags/v1.0.0`, `${commit}\trefs/tags/v1.0.0\n${commit}\trefs/tags/v1.0.0\n`,
    `${commit}\trefs/tags/v1.0.0^{}\n`, 'HEAD\trefs/tags/v1.0.0\n', `${commit}\trefs/tags/v1.0.0\nnot a line\n`])
    assert.equal(code(() => tagCommit(answer(text), '1.0.0')), 'git-failed ls-remote tags');
  // Lines for OTHER refs that end like the asked one are ignored, not refused (round 2 of the second read).
  assert.equal(tagCommit(answer(`${commit}\trefs/tags/x/refs/tags/v1.0.0\n`), '1.0.0'), null);
  assert.equal(tagCommit(answer(`${'b'.repeat(40)}\trefs/heads/refs/tags/v1.0.0\n${commit}\trefs/tags/v1.0.0\n`), '1.0.0'), commit);
  assert.equal(code(() => mainTip(answer(''))), 'git-failed ls-remote main');
  assert.equal(code(() => mainTip(answer(`${commit}\trefs/heads/x/refs/heads/main\n`))), 'git-failed ls-remote main');
  assert.equal(mainTip(answer(`${'b'.repeat(40)}\trefs/heads/x/refs/heads/main\n${commit}\trefs/heads/main\n`)), commit);
});

// N7 of the second read: git sends a peeled line for an annotated TAG, never for a branch. For the
// tip of main a peeled line is not git's answer, so the fact is unreadable; it must never become
// the answer (`main=B` beside `main^{}=A` read as A made `ready` say publish for A). Tags keep
// their rule: the peeled commit wins.
test('the tip of main refuses a peeled line; a tag still follows its peeled line', () => {
  const [tip, other] = ['a'.repeat(40), 'b'.repeat(40)];
  const answer = (text) => () => Buffer.from(text);
  assert.equal(mainTip(answer(`${tip}\trefs/heads/main\n`)), tip);
  for (const text of [`${tip}\trefs/heads/main\n${other}\trefs/heads/main^{}\n`, `${other}\trefs/heads/main^{}\n${tip}\trefs/heads/main\n`, `${other}\trefs/heads/main^{}\n`,
    `${tip}\trefs/heads/main\n${tip}\trefs/heads/main^{}\n`])
    assert.equal(code(() => mainTip(answer(text))), 'git-failed ls-remote main', JSON.stringify(text));
  // An unrelated ref that ends like main, with a peeled line of ITS own name, is still ignored.
  assert.equal(mainTip(answer(`${other}\trefs/heads/x/refs/heads/main^{}\n${tip}\trefs/heads/main\n`)), tip);
  // Tags, unchanged: the peeled line wins; a ref alone answers itself; only a peeled line is unreadable.
  assert.equal(tagCommit(answer(`${other}\trefs/tags/v1.0.0\n${tip}\trefs/tags/v1.0.0^{}\n`), '1.0.0'), tip);
  assert.equal(tagCommit(answer(`${tip}\trefs/tags/v1.0.0\n`), '1.0.0'), tip);
  assert.equal(code(() => tagCommit(answer(`${tip}\trefs/tags/v1.0.0^{}\n`), '1.0.0')), 'git-failed ls-remote tags');
});

test('build runs only on the planned commit with a clean tree', (t) => {
  const { dir, commit, git } = fixture(t);
  requireCleanCheckout(git, commit);
  assert.equal(code(() => requireCleanCheckout(git, 'c'.repeat(40))), 'checkout-mismatch HEAD is another commit');
  writeFileSync(join(dir, 'left-behind.txt'), 'x');
  assert.equal(code(() => requireCleanCheckout(git, commit)), 'checkout-mismatch the tree has changes');
  rmSync(join(dir, 'left-behind.txt'));
  requireCleanCheckout(git, commit);
  // A gitignored leftover counts too (N7 of the second read).
  mkdirSync(join(dir, '.git/info'), { recursive: true });
  writeFileSync(join(dir, '.git/info/exclude'), 'ignored/\n');
  mkdirSync(join(dir, 'ignored'));
  writeFileSync(join(dir, 'ignored/leftover.js'), 'x');
  assert.equal(code(() => requireCleanCheckout(git, commit)), 'checkout-mismatch the tree has changes');
});

// The reader's lsremote.mjs cases, against a real origin: a branch or a nested tag whose name ENDS
// like the asked ref is ignored, so pushing such a branch cannot stop every plan.
test('ref names that end like the asked ref: ignored on a real origin; tag objects peel to the commit', (t) => {
  const { dir, commit, git } = fixture(t);
  const run = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  writeFileSync(join(dir, 'b.txt'), 'b');
  run('add', 'b.txt');
  run('commit', '--quiet', '-m', 'b');
  const later = run('rev-parse', 'HEAD');
  run('push', '--quiet', 'origin', `${later}:refs/heads/refs/tags/v1.5.0`);
  assert.equal(tagCommit(git, '1.5.0'), null);
  run('push', '--quiet', 'origin', `${later}:refs/heads/x/refs/heads/main`);
  assert.equal(mainTip(git), commit);
  run('push', '--quiet', 'origin', `${commit}:refs/tags/x/refs/tags/v1.6.0`);
  assert.equal(tagCommit(git, '1.6.0'), null);
  run('push', '--quiet', 'origin', `${commit}:refs/tags/v1.7.0`, `${later}:refs/heads/v1.7.0`);
  assert.equal(tagCommit(git, '1.7.0'), commit);
  run('tag', '-a', '-m', 'a', 'v1.8.0', commit);
  run('tag', '-a', '-m', 'b', 'v1.9.0', 'v1.8.0');
  run('push', '--quiet', 'origin', 'v1.9.0');
  assert.equal(tagCommit(git, '1.9.0'), commit);
});
