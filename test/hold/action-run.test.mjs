import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { dedent, runBlocks } from './support/yaml-text.mjs';

// The action's real run: script, extracted from action.yml and run the way the runner runs a composite
// step (bash --noprofile --norc -eo pipefail), with the env: the action declares and the network replaced
// by the fetch stub (NODE_OPTIONS=--import reaches the `node` the script starts).
const actionDir = resolve('.github/actions/hold');
const script = dedent(runBlocks(readFileSync(join(actionDir, 'action.yml'), 'utf8'))[0]);
const stub = pathToFileURL(resolve('test/hold/support/fetch-stub.mjs')).href;
const BASH = '/bin/bash';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hold-action-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function runAction(t, { env = {}, path = process.env.PATH, answer = '[]' } = {}) {
  const file = join(tempDir(t), 'step.sh');
  writeFileSync(file, script);
  return spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', file], { encoding: 'utf8', env: {
    PATH: path, HOLD_MODE: 'publish', GH_TOKEN: 'ghs_secret_token_value', HOLD_ACTION_PATH: actionDir, GITHUB_REPOSITORY: 'footprintjs/example',
    NODE_OPTIONS: `--import=${stub}`, HOLD_STUB_BODY: answer, ...env } });
}
const couldNotCheck = (result, reason) => {
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^Hold check FAILED: could not check for a hold \(/);
  assert.match(result.stdout, reason);
};

test('action step: an open hold fails the step and lists it; the request is the fixed one', (t) => {
  const result = runAction(t, { answer: JSON.stringify([{ number: 12, title: 'Hold 10.8 until review' }]) });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /#12 "Hold 10.8 until review" https:\/\/github\.com\/footprintjs\/example\/issues\/12/);
  assert.match(result.stderr, /STUB-REQUEST GET https:\/\/api\.github\.com\/repos\/footprintjs\/example\/issues\?state=open&labels=hold-release&per_page=100/);
  assert.equal((result.stdout + result.stderr).includes('ghs_secret_token_value'), false);
});
test('action step: no hold passes the step', (t) => {
  const result = runAction(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^Hold check passed: no open issue or pull request in footprintjs\/example/);
});
test('action step: an empty or missing token is exit 1, never a pass', (t) => {
  for (const GH_TOKEN of ['', undefined]) couldNotCheck(runAction(t, { env: { GH_TOKEN } }), /GH_TOKEN is missing/);
});
test('action step: an unknown or empty action path, or a missing script, is exit 1 with a line that says so', (t) => {
  couldNotCheck(runAction(t, { env: { HOLD_ACTION_PATH: '' } }), /action path is unknown/);
  const empty = tempDir(t);
  mkdirSync(join(empty, '.github', 'actions', 'hold'), { recursive: true });
  couldNotCheck(runAction(t, { env: { HOLD_ACTION_PATH: join(empty, '.github', 'actions', 'hold') } }), /check script is missing/);
});
test('action step: no node on the runner is exit 1 with a line that says so', (t) => {
  couldNotCheck(runAction(t, { path: tempDir(t) }), /node is not installed/);
});
test('action step: a node older than package.json engines asks is exit 1 and names both versions', (t) => {
  const bin = tempDir(t);
  const shim = join(bin, 'node');
  writeFileSync(shim, `#!/bin/sh\n[ "$1" = "--version" ] && { echo v20.1.0; exit 0; }\nexec "${process.execPath}" "$@"\n`);
  chmodSync(shim, 0o755);
  const result = runAction(t, { path: `${bin}:/usr/bin:/bin`, answer: '[]' });
  couldNotCheck(result, /node 20\.1\.0 is older than the 22\.\d+\.\d+ this check needs/);
  // The same shim reporting a new enough node lets the command run: the refusal above is the version, not the shim.
  writeFileSync(shim, `#!/bin/sh\n[ "$1" = "--version" ] && { echo v99.0.0; exit 0; }\nexec "${process.execPath}" "$@"\n`);
  assert.equal(runAction(t, { path: `${bin}:/usr/bin:/bin` }).status, 0);
});
test('action step: a sort that cannot order the versions is exit 1 with its own line, not "node is older"', (t) => {
  const bin = tempDir(t);
  writeFileSync(join(bin, 'node'), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`);
  // Each fake sort READS ALL OF ITS INPUT before it exits, as a real sort does. One that exits
  // without reading closes the pipe while `printf` may still be writing: the writer then dies of
  // SIGPIPE (status 141) and, under pipefail, the step takes the "could not order" path instead of
  // the case the fake stands for. That race made this test fail by chance on Node 22 in CI
  // (run 43273576700).
  writeFileSync(join(bin, 'sort'), '#!/bin/sh\ncat >/dev/null\nexit 1\n');
  chmodSync(join(bin, 'node'), 0o755); chmodSync(join(bin, 'sort'), 0o755);
  const failing = runAction(t, { path: `${bin}:/usr/bin:/bin` });
  couldNotCheck(failing, /sort -V could not order the versions/);
  assert.doesNotMatch(failing.stdout, /older than/);
  writeFileSync(join(bin, 'sort'), '#!/bin/sh\ncat >/dev/null\nexit 0\n'); // reads, succeeds, prints nothing: still no pass
  const silent = runAction(t, { path: `${bin}:/usr/bin:/bin` });
  couldNotCheck(silent, /sort -V gave no ordering/);
  assert.doesNotMatch(silent.stdout, /older than/);
});
