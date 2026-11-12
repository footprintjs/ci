import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('.github/workflows/hold.yml', 'utf8');
const lines = source.split('\n');

// The run: block scalars of the file: text of every `run: |` / `run: x` step script.
function runBlocks() {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    if (!/^[|>][+-]?$/.test(match[2])) { blocks.push(match[2]); continue; }
    const body = [];
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > match[1].length); j++) body.push(lines[j]);
    blocks.push(body.join('\n'));
  }
  return blocks;
}

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
  const blocks = runBlocks();
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
  for (const name of ['HOLD_MODE: ${{ inputs.mode }}', 'GH_TOKEN: ${{ github.token }}', 'BASE_SHA: ${{ github.event.pull_request.base.sha }}'])
    assert.equal(step.includes(name), true, name);
});
