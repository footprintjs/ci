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
  const git = (...args) => execFileSync('git', ['-C', path, ...args], { encoding: 'utf8' }).trim();
  git('init', '--quiet');
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
  return { path, base, head: commit() };
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
