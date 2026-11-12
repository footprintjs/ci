import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { readVersions } from '../../src/hold/versions.mjs';

const cli = resolve('scripts/hold.mjs');
const run = (env) => spawnSync(process.execPath, [cli], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('the command exits 1 and says it could not check when its inputs are unusable (no network involved)', () => {
  for (const env of [{}, { HOLD_MODE: 'publish' }, { HOLD_MODE: 'bogus', GITHUB_REPOSITORY: 'a/b', GH_TOKEN: 'x' }, { HOLD_MODE: 'publish', GITHUB_REPOSITORY: 'a/b' }]) {
    const result = run(env);
    assert.equal(result.status, 1, JSON.stringify(env));
    assert.match(result.stdout, /Hold check FAILED: could not check/);
  }
});
test('the command exits 1 when the API cannot be reached (a name that never resolves)', () => {
  const result = run({ HOLD_MODE: 'publish', GITHUB_REPOSITORY: 'a/b', GH_TOKEN: 'ghs_x', GITHUB_API_URL: 'https://hold-check.invalid' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /could not check/);
});

function repoWith(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'hold-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Hold test');
  git('config', 'user.email', 'hold@example.invalid');
  const commit = (content) => { writeFileSync(join(dir, 'package.json'), content); git('add', 'package.json'); git('commit', '--quiet', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  return { dir, git, commit };
}
test('versions are read from real committed blobs: the base commit and HEAD', (t) => {
  const f = repoWith(t);
  const base = f.commit(JSON.stringify({ version: '1.0.0' }));
  f.commit(JSON.stringify({ version: '1.1.0' }));
  const git = (args) => execFileSync('git', ['-C', f.dir, ...args], { encoding: 'utf8' });
  assert.deepEqual(readVersions(git, base), { base: '1.0.0', head: '1.1.0' });
  assert.throws(() => readVersions(git, 'f'.repeat(40)), /base side/);
  assert.throws(() => readVersions(git, 'HEAD'), /full commit SHA/);
});
