import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from './run.mjs';

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { stdout: value => out.push(value), stderr: value => err.push(value) } };
}

test('report treats candidate packages and source as data and returns zero for advisory findings', t => {
  const repo = mkdtempSync(join(tmpdir(), 'structure-candidate-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const canary = join(repo, 'EXECUTED');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'node_modules/typescript'), { recursive: true });
  writeFileSync(join(repo, 'node_modules/typescript/package.json'), '{"main":"index.js"}');
  writeFileSync(join(repo, 'node_modules/typescript/index.js'), `require('fs').writeFileSync(${JSON.stringify(canary)}, 'bad');`);
  writeFileSync(join(repo, 'package.json'), '{"scripts":{"prepare":"node canary.cjs"}}');
  writeFileSync(join(repo, 'canary.cjs'), `require('fs').writeFileSync(${JSON.stringify(canary)}, 'bad');`);
  writeFileSync(join(repo, 'src/entry.ts'), `import '../canary.cjs';\nlet state = 1;\nexport { state };\n`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  const git = (...args) => execFileSync('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-C', repo, ...args],
  { encoding: 'utf8', env, stdio: 'pipe', timeout: 5000 }).trim();
  git('init', '--quiet', '--initial-branch=main', '--template=');
  git('add', '--force', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null',
    'commit', '--quiet', '-m', 'candidate');
  const { out, err, io } = capture();
  assert.equal(runCli(['report', '--repo', repo, '--head', 'HEAD'], io), 0);
  assert.deepEqual(err, []);
  const report = JSON.parse(out.join(''));
  assert.ok(report.findings.some(item => item.rule === 'module-state'));
  assert.equal(report.metadata.parserVersion, '5.4.5');
  assert.equal(existsSync(canary), false);
});

test('invalid command and unreadable repository return structured tool errors', () => {
  for (const args of [['unknown'], ['report', '--repo', '/no/such/structure-repository']]) {
    const { out, err, io } = capture();
    assert.equal(runCli(args, io), 2);
    assert.equal(JSON.parse(err.join('')).status, 'tool-error');
    assert.deepEqual(out, []);
  }
});
