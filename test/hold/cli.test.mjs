import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { runHold } from '../../src/hold/run.mjs';

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

// The exit code is the whole product, so these run the REAL command (scripts/hold.mjs) with the network
// replaced by test/hold/support/fetch-stub.mjs, loaded with `node --import`. The stub answers what the
// test says and echoes each request (method and URL, never headers) to stderr.
const stub = pathToFileURL(resolve('test/hold/support/fetch-stub.mjs')).href;
const runStubbed = (answer, env = {}) => spawnSync(process.execPath, ['--import', stub, cli], { encoding: 'utf8',
  env: { PATH: process.env.PATH, HOLD_MODE: 'publish', GITHUB_REPOSITORY: 'footprintjs/example', GH_TOKEN: 'ghs_secret_token_value',
    ...(answer.status ? { HOLD_STUB_STATUS: String(answer.status) } : {}), ...(answer.body !== undefined ? { HOLD_STUB_BODY: answer.body } : {}), ...env } });

test('exit code: one open hold makes the command exit 1 and print the listing', () => {
  const result = runStubbed({ body: JSON.stringify([{ number: 12, title: 'Hold 10.8 until review' }, { number: 15, title: 'Heading', pull_request: {} }]) });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Hold check FAILED: a release is on hold in footprintjs\/example\./);
  assert.match(result.stdout, /#12 "Hold 10.8 until review" https:\/\/github\.com\/footprintjs\/example\/issues\/12/);
  assert.match(result.stdout, /#15 \(pull request\) "Heading"/);
  assert.equal(result.stderr.trim(), 'STUB-REQUEST GET https://api.github.com/repos/footprintjs/example/issues?state=open&labels=hold-release&per_page=100');
  assert.equal((result.stdout + result.stderr).includes('ghs_secret_token_value'), false);
});
test('exit code: an empty list makes the command exit 0 and print the pass line', () => {
  const result = runStubbed({ body: '[]' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), 'Hold check passed: no open issue or pull request in footprintjs/example carries "hold-release".');
  assert.equal((result.stdout + result.stderr).includes('ghs_secret_token_value'), false);
});
test('exit code: a failed answer, or one that is not a list, is exit 1 and says it could not check (never 0)', () => {
  for (const answer of [{ status: 500, body: '[]' }, { status: 403, body: '[]' }, { body: '{"message":"x"}' }, { body: 'not json' }, { body: 'null' }]) {
    const result = runStubbed(answer);
    assert.equal(result.status, 1, JSON.stringify(answer));
    assert.match(result.stdout, /Hold check FAILED: could not check/);
  }
});

// A real repository with a real merge commit M = merge(base tip, pull request head), the way
// refs/pull/N/merge is built. `pr` edits the branch, `main` edits the base after the branch left.
function mergeFixture(t, { prVersion, mainVersion }) {
  const dir = mkdtempSync(join(tmpdir(), 'hold-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const commit = (files, message) => {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    git('add', '.'); git('commit', '--quiet', '-m', message); return git('rev-parse', 'HEAD');
  };
  const pkg = (version) => JSON.stringify({ name: 'x', version });
  git('init', '--quiet', '-b', 'main');
  git('config', 'user.name', 'Hold test'); git('config', 'user.email', 'hold@example.invalid');
  commit({ 'package.json': pkg('1.0.0'), 'a.txt': 'a' }, 'start');
  git('checkout', '--quiet', '-b', 'pr');
  const head = commit(prVersion ? { 'package.json': pkg(prVersion) } : { 'a.txt': 'changed on the branch' }, 'pull request');
  git('checkout', '--quiet', 'main');
  if (mainVersion) commit({ 'package.json': pkg(mainVersion) }, 'base moved on');
  git('merge', '--quiet', '--no-ff', '-m', 'merge', 'pr'); // HEAD is now the merge commit
  return { dir, head, run: (extra = {}) => runHold({
    env: { HOLD_MODE: 'pull-request', HOLD_EVENT_NAME: 'pull_request', HOLD_HEAD_SHA: head, GITHUB_REPOSITORY: 'a/b', GH_TOKEN: 'ghs_x', ...extra },
    fetcher: async () => Response.json([{ number: 3, title: 'hold' }]),
    git: (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }) }) };
}
test('real merge commit: base moved and bumped the version, the pull request did not touch it: PASSES with a hold open', async (t) => {
  const f = mergeFixture(t, { mainVersion: '2.0.0' });
  const result = await f.run();
  assert.equal(result.code, 0, result.lines.join('\n'));
  assert.match(result.lines.join('\n'), /leaves the package.json version alone \(2\.0\.0\)/);
});
test('real merge commit: the pull request bumps the version: FAILS with a hold open, naming both versions', async (t) => {
  const f = mergeFixture(t, { prVersion: '1.1.0' });
  const result = await f.run();
  assert.equal(result.code, 1);
  assert.match(result.lines.join('\n'), /1\.0\.0 -> 1\.1\.0/);
});
test('real merge commit: a head SHA of another commit, and a checkout that is not a merge, fail closed', async (t) => {
  const f = mergeFixture(t, { mainVersion: '2.0.0' });
  failedToCheck(await f.run({ HOLD_HEAD_SHA: 'c'.repeat(40) }));
  execFileSync('git', ['-C', f.dir, 'checkout', '--quiet', 'HEAD^1']); // a plain commit, as a push event would leave
  failedToCheck(await f.run());
});
function failedToCheck(result) {
  assert.equal(result.code, 1);
  assert.match(result.lines.join('\n'), /could not check/);
}
