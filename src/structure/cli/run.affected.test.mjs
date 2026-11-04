import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from './run.mjs';

function repository(t) {
  const path = mkdtempSync(join(tmpdir(), 'structure-affected-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  const git = (...args) => execFileSync('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-C', path, ...args],
  { encoding: 'utf8', env, stdio: 'pipe', timeout: 5000 }).trim();
  git('init', '--quiet', '--initial-branch=main', '--template=');
  const files = { 'src/index.ts': "export { first } from './first.js'; export { second } from './second.js';",
    'src/first.ts': 'export function first() { return 1; }', 'src/second.ts': 'export function second() { return 2; }',
    'test/first.test.ts': "import { first } from '../src/index.js'; void first();",
    'test/second.test.ts': "import { second } from '../src/index.js'; void second();" };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(path, name, '..'), { recursive: true });
    writeFileSync(join(path, name), text);
  }
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  writeFileSync(join(path, 'src/first.ts'), 'export function first() { return 3; }');
  return { path, base, head: commit(), commit };
}

test('affected CLI reads two exact trees and emits an advisory owner-followed selection', t => {
  const { path, base, head } = repository(t);
  const output = [];
  const errors = [];
  const io = { stdout: value => output.push(value), stderr: value => errors.push(value) };
  const args = ['affected', '--repo', path, '--base', base, '--head', head];
  assert.equal(runCli(args, io), 0);
  assert.deepEqual(errors, []);
  const report = JSON.parse(output.join(''));
  assert.deepEqual(report.tests, ['test/first.test.ts']);
  assert.equal(report.estimate, true);
  assert.equal(report.fullSuiteBeforeMerge, true);
  assert.equal(report.headId, head);
  assert.equal(report.baseId, base);
  output.length = 0;
  assert.equal(runCli([...args, '--format', 'text'], io), 0);
  assert.match(output.join(''), /test\/first\.test\.ts[\s\S]*Full suite required before merge: yes/);
});

test('affected requires an explicit comparison base', () => {
  const errors = [];
  assert.equal(runCli(['affected'], { stdout: () => assert.fail('unexpected output'), stderr: text => errors.push(text) }), 2);
  assert.match(JSON.parse(errors.join('')).message, /base/i);
});

test('affected CLI observes real binary object changes through the Git adapter', t => {
  const { path, commit } = repository(t);
  writeFileSync(join(path, 'src/value.bin'), Buffer.from([255, 0, 1]));
  writeFileSync(join(path, 'test/asset.test.ts'), "import asset from '../src/value.bin'; void asset;");
  const base = commit();
  writeFileSync(join(path, 'src/value.bin'), Buffer.from([255, 0, 2]));
  const head = commit();
  const output = [];
  assert.equal(runCli(['affected', '--repo', path, '--base', base, '--head', head], {
    stdout: text => output.push(text), stderr: text => assert.fail(text),
  }), 0);
  const result = JSON.parse(output.join(''));
  assert.deepEqual(result.changedPaths, ['src/value.bin']);
  assert.deepEqual(result.tests, ['test/asset.test.ts']);
  assert.equal(result.fullSuiteBeforeMerge, true);
});
