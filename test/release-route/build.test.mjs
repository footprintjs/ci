// build against a real repository, with a runner double that records every command and plays
// npm pack. No command of the repository is really run here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build, commandEnv } from '../../src/release-route/build.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import fixture from './archive/fixture.cjs';

const manifest = { name: 'footprint-example', version: '1.2.3' };
const settings = { schema: 1, node: '22', systemPackages: ['ffmpeg'], install: 'npm ci', checks: ['npm test', 'npx publint'], archive: ['dist/'], changelog: 'titled' };

function repo(t, { pkg = manifest, release = settings } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'route-build-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  mkdirSync(join(source, '.github'), { recursive: true });
  const git = (args) => execFileSync('git', ['-C', source, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '--quiet', '-b', 'main']);
  git(['config', 'user.name', 'Route test']);
  git(['config', 'user.email', 'route@example.invalid']);
  writeFileSync(join(source, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(source, '.github/release.json'), JSON.stringify(release));
  git(['add', '.']);
  git(['commit', '--quiet', '-m', 'start']);
  return { root, source, git, commit: git(['rev-parse', 'HEAD']).toString().trim(), out: join(root, 'out') };
}

// Records argv lists; `npm pack` writes `packs` (name -> bytes) into its destination.
function runner({ fail, packs = { 'footprint-example-1.2.3.tgz': fixture.pack({ ...manifest }) } } = {}) {
  const calls = [];
  const run = (argv, { cwd, env }) => {
    calls.push({ argv: argv.join(' '), cwd, env });
    if (fail && argv.join(' ').startsWith(fail)) return 1;
    if (argv[0] === 'npm' && argv[1] === 'pack') for (const [name, bytes] of Object.entries(packs)) writeFileSync(join(argv[4], name), bytes);
    return 0;
  };
  return { run, calls };
}
const code = (fn) => {
  try { fn(); } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'built';
};
const go = (r, run, extra = {}) => build({ git: r.git, run, source: r.source, commit: r.commit, out: r.out, env: {}, nodeVersion: '22.14.0', ...extra });

test('runs apt, install, checks and pack in order, without a shell, then checks the archive', (t) => {
  const r = repo(t);
  const { run, calls } = runner();
  const result = go(r, run);
  assert.deepEqual(calls.map((c) => c.argv.replace(/release-route-pack-\w+/, 'PACK')), [
    'sudo apt-get update', 'sudo apt-get install -y --no-install-recommends ffmpeg', 'npm ci', 'npm test', 'npx publint',
    `npm pack --ignore-scripts --pack-destination ${join(tmpdir(), 'PACK')}`]);
  assert.ok(calls.every((c) => c.cwd === r.source));
  assert.deepEqual(readdirSync(r.out), ['package.tgz']);
  assert.deepEqual([result.name, result.version, result.file, result.files], ['footprint-example', '1.2.3', 'package.tgz', 2]);
});

test('no system packages, no apt', (t) => {
  const r = repo(t, { release: { ...settings, systemPackages: [] } });
  const { run, calls } = runner();
  go(r, run);
  assert.ok(!calls.some((c) => c.argv.includes('apt-get')));
});

test('each failing command stops with its own refusal, and nothing after it runs', (t) => {
  for (const [fail, expected] of [
    ['sudo apt-get update', 'system-packages-failed apt-get update'],
    ['sudo apt-get install', 'system-packages-failed apt-get install'],
    ['npm ci', 'install-failed npm ci'],
    ['npx publint', 'check-failed checks[1]: npx publint'],
    ['npm pack', 'pack-failed'],
  ]) {
    const r = repo(t);
    const { run, calls } = runner({ fail });
    assert.equal(code(() => go(r, run)), expected);
    assert.ok(calls.at(-1).argv.startsWith(fail));
  }
});

test('npm pack must leave exactly one regular .tgz', (t) => {
  assert.equal(code(() => go(repo(t), runner({ packs: {} }).run)), 'pack-output 0 entries');
  assert.equal(code(() => go(repo(t), runner({ packs: { 'a.tgz': 'x', 'b.tgz': 'y' } }).run)), 'pack-output 2 entries');
  assert.equal(code(() => go(repo(t), runner({ packs: { 'a.txt': 'x' } }).run)), 'pack-output 1 entries');
});

test('the first archive check runs on what was packed', (t) => {
  const noDist = { 'x.tgz': fixture.pack({ ...manifest }) };
  assert.equal(code(() => go(repo(t, { release: { ...settings, archive: ['dist/', 'types/'] } }), runner({ packs: noDist }).run)), 'archive-missing types/');
  assert.equal(code(() => go(repo(t), runner({ packs: { 'x.tgz': fixture.pack({ ...manifest, version: '9.9.9' }) } }).run)), 'archive-version');
});

test('the checkout, the settings, the version and the Node major are checked before any command', (t) => {
  const { run, calls } = runner();
  const r = repo(t);
  assert.equal(code(() => go(r, run, { commit: 'd'.repeat(40) })), 'checkout-mismatch HEAD is another commit');
  writeFileSync(join(r.source, 'stray.txt'), 'x');
  assert.equal(code(() => go(r, run)), 'checkout-mismatch the tree has changes');
  assert.equal(code(() => go(repo(t), run, { nodeVersion: '24.1.0' })), 'node-version running 24, settings say 22');
  assert.equal(code(() => go(repo(t, { pkg: { ...manifest, version: '1.2.3-rc.1' } }), run)), 'version-not-plain');
  assert.equal(code(() => go(repo(t, { release: { ...settings, proposer: 'none' } }), run)), 'settings-unknown-key proposer');
  assert.equal(calls.length, 0);
});

test('the output folder must be absolute, empty, and outside the checkout', (t) => {
  const { run, calls } = runner();
  const r = repo(t);
  assert.equal(code(() => go(r, run, { out: 'relative/out' })), 'output-folder not absolute');
  mkdirSync(r.out);
  writeFileSync(join(r.out, 'old.tgz'), 'x');
  assert.equal(code(() => go(r, run)), 'output-folder not an empty folder');
  const r2 = repo(t);
  assert.equal(code(() => go(r2, run, { out: join(r2.source, 'out') })), 'output-folder inside the checkout');
  assert.equal(code(() => go(r2, run, { out: r2.source })), 'output-folder not an empty folder');
  assert.equal(calls.length, 0);
});

test('the repository\'s commands see no file-command variable, no ROUTE_ input and nothing named like a secret', (t) => {
  const env = { PATH: '/bin', HOME: '/h', CI: 'true', GITHUB_SHA: 'a',
    GITHUB_OUTPUT: '/o', GITHUB_ENV: '/e', GITHUB_PATH: '/p', GITHUB_STATE: '/s', GITHUB_STEP_SUMMARY: '/m', github_output: '/o2',
    ROUTE_OUT: '/x', ROUTE_COMMIT: 'c', route_npm_dir: '/n',
    GITHUB_TOKEN: 'x', gh_token: 'x', NODE_AUTH_TOKEN: 'x', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'x', ACTIONS_ID_TOKEN_REQUEST_URL: 'x',
    CLAUDE_CODE_MESSAGING_TOKEN: 'x', AWS_SECRET_ACCESS_KEY: 'x', DB_PASSWORD: 'x', SSH_AUTH_SOCK: 'x', GOOGLE_APPLICATION_CREDENTIALS: 'x',
    npm_config__authToken: 'x', API_KEY: 'x' };
  assert.deepEqual(commandEnv(env), { PATH: '/bin', HOME: '/h', CI: 'true', GITHUB_SHA: 'a', NPM_CONFIG_UPDATE_NOTIFIER: 'false' });
  const { run, calls } = runner();
  go(repo(t), run, { env });
  assert.ok(calls.every((c) => !('GITHUB_TOKEN' in c.env) && c.env.PATH === '/bin'));
});
