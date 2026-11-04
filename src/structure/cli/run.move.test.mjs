import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from './run.mjs';

function repository(t, canary = false) {
  const path = mkdtempSync(join(tmpdir(), 'structure-move-cli-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  const git = (...args) => execFileSync('git', ['--no-pager', '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-C', path, ...args],
  { env, encoding: 'utf8', stdio: 'pipe', timeout: 5000 }).trim();
  git('init', '--quiet', '--initial-branch=main', '--template=');
  const write = (name, text) => { mkdirSync(join(path, name, '..'), { recursive: true }); writeFileSync(join(path, name), text); };
  write('src/index.ts', "export { run } from './service.js';\n");
  write('src/service.ts', '/** Owned helper. */\nfunction helper(value: number) { return value + 1; }\nexport function run(value: number) { return helper(value); }\n');
  if (canary) {
    write('package.json', '{"name":"candidate","scripts":{"prepare":"node canary.cjs"}}');
    write('canary.cjs', "require('node:fs').writeFileSync(__dirname + '/EXECUTED', 'bad');\n");
  }
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  const base = commit();
  write('src/service/helper.ts', '/** Owned helper. */\nexport function helper(value: number) { return value + 1; }\n');
  write('src/service.ts', "import { helper } from './service/helper.js';\nexport function run(value: number) { return helper(value); }\n");
  return { path, base, head: commit() };
}

function capture(args) {
  const output = []; const errors = [];
  const exit = runCli(args, { stdout: text => output.push(text), stderr: text => errors.push(text) });
  return { exit, output: output.join(''), errors: errors.join('') };
}

test('verify-move reads exact Git trees and reports real unit identity through its command', t => {
  const { path, base, head } = repository(t);
  const args = ['verify-move', '--repo', path, '--base', base, '--head', head];
  const result = capture(args);
  assert.equal(result.exit, 0, result.errors);
  const report = JSON.parse(result.output);
  assert.equal(report.verification, 'move');
  assert.equal(report.headId, head); assert.equal(report.baseId, base);
  assert.deepEqual(report.findings, []);
  assert.equal(report.coverage.complete, true);
  assert.ok(report.moves.some(unit => unit.name === 'helper' && unit.from.path === 'src/service.ts'
    && unit.to.path === 'src/service/helper.ts'));
  const text = capture([...args, '--format', 'text']);
  assert.equal(text.exit, 0, text.errors);
  assert.match(text.output, /Whole-unit moves: 1[\s\S]*Findings: 0[\s\S]*Unverified: 0/);
});

test('verify-move requires a base and never executes candidate packages or source', t => {
  const missing = capture(['verify-move']);
  assert.equal(missing.exit, 2);
  assert.match(JSON.parse(missing.errors).message, /base/i);
  const { path, base, head } = repository(t, true);
  const result = capture(['verify-move', '--repo', path, '--base', base, '--head', head]);
  assert.equal(result.exit, 0, result.errors);
  assert.ok(Array.isArray(JSON.parse(result.output).moves));
  assert.equal(existsSync(join(path, 'EXECUTED')), false);
});
