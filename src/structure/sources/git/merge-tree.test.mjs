import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGitSnapshot } from './index.mjs';
import { checkSnapshots } from '../../check/report.mjs';

function repository(t) {
  const path = mkdtempSync(join(tmpdir(), 'structure-merge-tree-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  const git = (...args) => execFileSync('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-C', path, ...args],
  { encoding: 'utf8', env, stdio: 'pipe' }).trim();
  git('init', '--quiet', '--initial-branch=main', '--template=');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(path, 'src'));
  return { path, git };
}

const work = count => ['export function work() {', ...Array.from({ length: count }, (_, index) =>
  `  use(${index});`), '}', ''].join('\n');

// A PR merge tree includes main's independent improvements; a stale raw branch
// can appear to undo them even when the normal merge preserves both changes.
test('a normal candidate merge preserves main shrinkage that the stale branch comparison misreads as growth', t => {
  const { path, git } = repository(t);
  writeFileSync(join(path, 'src/work.ts'), work(80));
  writeFileSync(join(path, 'README.md'), 'Initial documentation.\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'Initial oversized function');
  git('switch', '--quiet', '-c', 'feature');
  writeFileSync(join(path, 'README.md'), 'Feature documentation.\n');
  git('add', 'README.md');
  git('commit', '--quiet', '-m', 'Independent feature documentation');
  const feature = git('rev-parse', 'HEAD');
  git('switch', '--quiet', 'main');
  writeFileSync(join(path, 'src/work.ts'), work(60));
  git('add', 'src/work.ts');
  git('commit', '--quiet', '-m', 'Shrink the existing function on main');
  const base = git('rev-parse', 'HEAD');
  const baseline = readGitSnapshot(path, base);
  const rawBranch = checkSnapshots(readGitSnapshot(path, feature), baseline);
  assert.ok(rawBranch.ratchet.regressions.some(item => item.rule === 'function-lines'
    && item.path === 'src/work.ts' && item.reason === 'grown-unit'));

  git('merge', '--quiet', '--no-ff', '--no-edit', 'feature');
  const merge = git('rev-parse', 'HEAD');
  assert.equal(git('rev-parse', 'HEAD^1'), base);
  assert.equal(git('rev-parse', 'HEAD^2'), feature);
  assert.equal(git('rev-parse', 'HEAD:src/work.ts'), git('rev-parse', `${base}:src/work.ts`));
  assert.equal(git('show', 'HEAD:README.md'), 'Feature documentation.');
  const candidate = checkSnapshots(readGitSnapshot(path, merge), baseline);
  assert.deepEqual(candidate.ratchet.regressions, []);
  assert.equal(candidate.baseId, base);
  assert.equal(candidate.id, merge);
});
