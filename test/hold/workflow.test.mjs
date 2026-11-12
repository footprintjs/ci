import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runBlocks } from './support/yaml-text.mjs';

const source = readFileSync('.github/workflows/hold.yml', 'utf8');
const lines = source.split('\n');

test('permissions are exactly the three read scopes, once, at the top level', () => {
  const at = lines.findIndex((line) => line === 'permissions:');
  assert.notEqual(at, -1);
  const block = [];
  for (let i = at + 1; /^\s+\S/.test(lines[i] ?? ''); i++) block.push(lines[i].trim());
  assert.deepEqual(block, ['contents: read', 'issues: read', 'pull-requests: read']);
  assert.equal(lines.filter((line) => /^\s*permissions:/.test(line)).length, 1);
  assert.doesNotMatch(source, /write|secrets:|inherit/);
});
test('it is a reusable workflow with exactly the two required string inputs', () => {
  assert.match(source, /^on:\n {2}workflow_call:\n {4}inputs:\n {6}tool_sha:\n/m);
  assert.equal([...source.matchAll(/^ {6}(\w+):$/gm)].map((m) => m[1]).join(','), 'tool_sha,mode');
  assert.equal([...source.matchAll(/required: true/g)].length, 2);
});
test('every uses: is a full commit SHA, the pins the other workflows use', () => {
  const uses = lines.filter((line) => /\buses:/.test(line)).map((line) => line.replace(/^.*uses:\s*/, ''));
  assert.equal(uses.length >= 3, true);
  for (const value of uses) assert.match(value, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
  const others = ['check.yml', 'file-size.yml'].map((name) => readFileSync(`.github/workflows/${name}`, 'utf8')).join('\n');
  for (const value of uses) assert.equal(others.includes(value), true, `${value} is not a pin another workflow uses`);
});
test('no inputs or event expression is interpolated into a run: block', () => {
  const blocks = runBlocks(source);
  assert.equal(blocks.length >= 2, true);
  for (const block of blocks) assert.doesNotMatch(block, /\$\{\{/);
});
test('one job with a short timeout; the tool is checked out at tool_sha, the caller tree only in pull-request mode', () => {
  assert.equal([...source.slice(source.indexOf('\njobs:\n')).matchAll(/^ {2}\w[\w-]*:$/gm)].length, 1);
  assert.match(source, /timeout-minutes: [1-5]\n/);
  assert.match(source, /repository: footprintjs\/ci\n {10}ref: \$\{\{ inputs\.tool_sha \}\}/);
  assert.match(source, /if: inputs\.mode == 'pull-request'\n {8}uses: /);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.match(source, /node hold-tool\/scripts\/hold\.mjs/);
  assert.doesNotMatch(source, /npm (ci|install)/);
});
test('the validation step comes before any checkout and the command takes its inputs through env:', () => {
  assert.equal(source.indexOf('Validate tool pin and mode') < source.indexOf('actions/checkout'), true);
  const step = source.slice(source.indexOf('Refuse while a hold-release label is open'));
  for (const name of ['HOLD_MODE: ${{ inputs.mode }}', 'GH_TOKEN: ${{ github.token }}', 'HOLD_EVENT_NAME: ${{ github.event_name }}', 'HOLD_HEAD_SHA: ${{ github.event.pull_request.head.sha }}'])
    assert.equal(step.includes(name), true, name);
  assert.doesNotMatch(source, /base\.sha/, 'the event base SHA is not used: the merge commit first parent is');
});
test('the runner image is pinned, not a floating label', () => {
  assert.equal([...source.matchAll(/^\s*runs-on:\s*(.+)$/gm)].map((m) => m[1].trim()).join(','), 'ubuntu-24.04');
  assert.doesNotMatch(source, /-latest/);
});
test('the merge-commit checkout reads exactly what the proof needs: github.sha, two levels deep', () => {
  // The merge commit and its two parents are all versions.mjs reads. Depth 1 would have no parent to read;
  // the head SHA from the event as the ref would not be a merge commit. Both would fail closed in a real
  // run and turn every pull request red, so both are pinned here.
  const step = source.slice(source.indexOf('Checkout candidate merge tree'), source.indexOf('actions/setup-node'));
  assert.match(step, /ref: \$\{\{ github\.sha \}\}\n {10}fetch-depth: 2\n {10}persist-credentials: false\n {10}path: source\n/);
  assert.doesNotMatch(step, /fetch-depth: (0|1)\b|head\.sha/);
});

// ---- the action form: .github/actions/hold/action.yml -------------------------------------------------
const action = readFileSync('.github/actions/hold/action.yml', 'utf8');

test('action: a composite whose only input is the token, defaulting to the job token', () => {
  assert.match(action, /^runs:\n {2}using: composite\n {2}steps:\n/m);
  assert.deepEqual([...action.matchAll(/^ {2}(\w+):$/gm)].map((m) => m[1]).filter((name) => name !== 'steps'), ['token']);
  assert.match(action, /^ {2}token:\n(?: {4}.*\n)*? {4}default: \$\{\{ github\.token \}\}\n/m);
  assert.match(action, /GH_TOKEN: \$\{\{ inputs\.token \}\}/);
});
test('action: the mode is fixed to publish; no input and no expression can change it', () => {
  assert.equal([...action.matchAll(/HOLD_MODE:\s*(.*)$/gm)].map((m) => m[1].trim()).join(','), 'publish');
  assert.doesNotMatch(action, /inputs\.mode|\bmode:/);
});
test('action: no expression inside a run: block; values come through env:', () => {
  const blocks = runBlocks(action);
  assert.equal(blocks.length, 1);
  for (const block of blocks) assert.doesNotMatch(block, /\$\{\{/);
  assert.match(action, /HOLD_ACTION_PATH: \$\{\{ github\.action_path \}\}/);
});
test('action: the script is found from the action\'s own location, so one pin covers both; nothing is checked out or installed', () => {
  const [block] = runBlocks(action);
  assert.match(block, /root="\$HOLD_ACTION_PATH\/\.\.\/\.\.\/\.\."/);
  assert.match(block, /node "\$root\/scripts\/hold\.mjs"/);
  assert.doesNotMatch(action, /\buses:|npm (ci|install)|curl|wget/);
});
test('action: no uses: that is not a full commit SHA, and every step names its shell', () => {
  for (const [, value] of action.matchAll(/\buses:\s*(\S+)/g)) assert.match(value, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
  assert.equal((action.match(/^\s+- name:/gm) ?? []).length, (action.match(/shell: bash/g) ?? []).length);
});
test('action: it names every way of not being able to look and fails on each', () => {
  const [block] = runBlocks(action);
  for (const reason of ['node is not installed', 'the action path is unknown', 'the check script is missing', 'older than'])
    assert.equal(block.includes(reason), true, reason);
  assert.doesNotMatch(block, /exit 0|\|\| true|continue-on-error/);
  assert.doesNotMatch(action, /continue-on-error/);
});

// ---- this repository's own run of both forms: .github/workflows/check.yml -----------------------------
const check = readFileSync('.github/workflows/check.yml', 'utf8');
const job = (name) => {
  const from = check.indexOf(`\n  ${name}:\n`);
  assert.notEqual(from, -1, name);
  const rest = check.slice(from + 1).split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  const next = rest.slice(1).search(/^ {2}[\w-]+:$/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
};
const THREE = '    permissions:\n      contents: read\n      issues: read\n      pull-requests: read\n';

test('check.yml: the step form runs the local action in a job with exactly the three read scopes', () => {
  const body = job('hold-step');
  assert.equal(body.includes(THREE), true);
  assert.equal((body.match(/permissions:/g) ?? []).length, 1);
  assert.match(body, /uses: actions\/checkout@[a-f0-9]{40}\n {8}with:\n {10}ref: \$\{\{ github\.sha \}\}\n {10}persist-credentials: false\n/);
  assert.match(body, /\n {8}uses: \.\/\.github\/actions\/hold\n/);
  assert.doesNotMatch(body, /write|secrets:|with:\n {10}token/);
});
test('check.yml: the workflow form calls the local hold.yml in pull-request mode, for the pull_request event only', () => {
  const body = job('hold-workflow');
  assert.equal(body.includes(THREE), true);
  assert.match(body, /\n {4}if: github\.event_name == 'pull_request'\n/);
  assert.match(body, /\n {4}uses: \.\/\.github\/workflows\/hold\.yml\n {4}with:\n {6}tool_sha: \$\{\{ github\.sha \}\}\n {6}mode: pull-request\n/);
  assert.doesNotMatch(body, /secrets:|write/);
});
test('check.yml: the existing check job is untouched (runner image, matrix, steps) and no hold job is a required-by-name matrix member', () => {
  const body = job('check');
  assert.match(body, /runs-on: ubuntu-latest/);
  assert.match(body, /node: \[22, 24\]/);
  assert.doesNotMatch(body, /hold/);
  assert.match(check, /^permissions:\n {2}contents: read\n/m);
});
