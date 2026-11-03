import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { test } from 'node:test';
import { lineCount, readTree } from '../../src/file-size/git-tree.mjs';

const cli = resolve('scripts/file-size.mjs');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'file-size-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'File size test');
  git('config', 'user.email', 'file-size@example.invalid');
  mkdirSync(join(dir, 'src'));
  const write = (path, text) => writeFileSync(join(dir, path), text);
  const commit = () => { git('add', '.'); git('commit', '--quiet', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  const check = (base) => spawnSync(process.execPath, [cli, '--repo', dir, '--base', base], { encoding: 'utf8' });
  return { dir, git, write, commit, check };
}
const baseline = (files) => JSON.stringify({ files, exclude: [] });

test('physical line count covers empty, LF, CRLF and an unterminated final line', () => {
  for (const [text, count] of [['', 0], ['a', 1], ['a\n', 1], ['a\r\nb\r\n', 2], ['a\nb', 2]])
    assert.equal(lineCount(Buffer.from(text)), count);
});
test('CLI reads actual committed source and initial baseline, without running repo code', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n'.repeat(701));
  f.write('src/README.md', 'line\n'.repeat(601));
  const base = f.commit();
  f.write('.file-size-baseline.json', baseline({ 'src/a.ts': 701, 'src/README.md': 601 }));
  f.commit();
  f.write('src/a.ts', 'uncommitted\n'.repeat(1000));
  f.write('src/untracked.ts', 'untracked\n'.repeat(1000));
  const result = f.check(base);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 source files, 2 oversized baseline entries, 0 violations/);
  assert.equal(readTree(f.dir, 'HEAD').files['src/a.ts'], 701);
});
test('CLI refuses a newly oversized source and prints measured count and cap', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n');
  f.write('.file-size-baseline.json', baseline({}));
  const base = f.commit();
  f.write('src/new.ts', 'line\n'.repeat(601));
  f.commit();
  const result = f.check(base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /src\/new.ts: 601 > 600/);
});
test('CLI refuses baseline inflation using actual prior committed baseline', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n'.repeat(701));
  f.write('.file-size-baseline.json', baseline({ 'src/a.ts': 701 }));
  const base = f.commit();
  f.write('src/a.ts', 'line\n'.repeat(702));
  f.write('.file-size-baseline.json', baseline({ 'src/a.ts': 702 }));
  f.commit();
  const result = f.check(base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /baseline increased 701 -> 702/);
});
test('symlinks are refused without following their target', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n');
  f.write('.file-size-baseline.json', baseline({}));
  const base = f.commit();
  symlinkSync('/definitely/not/a/file', join(f.dir, 'src/link.ts'));
  f.commit();
  const result = f.check(base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires regular tracked files: src\/link.ts/);
});
test('missing candidate baseline and unavailable or noncanonical base fail closed', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n');
  const base = f.commit();
  assert.equal(f.check(base).status, 1);
  assert.equal(f.check('f'.repeat(40)).status, 1);
  assert.equal(f.check('main').status, 1);
});

test('reusable workflow checks the real release plan lineage and installs no candidate dependencies', () => {
  const text = execFileSync('git', ['show', 'HEAD:.github/workflows/check.yml'], { encoding: 'utf8' });
  assert.match(text, /npm test/); // The normal workflow runs the fixed workflow-test glob.
  const workflow = readFileSync('.github/workflows/file-size.yml', 'utf8');
  assert.match(workflow, /ref: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /BASE_SHA=\$\(git -C source rev-parse HEAD\^\)/);
  assert.match(workflow, /BASE_SHA=\$EVENT_BASE/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /npm (?:ci|install)|secrets: inherit|contents: write/);
});

test('CLI does not accept HEAD as its comparison base', (t) => {
  const f = fixture(t);
  f.write('src/a.ts', 'line\n');
  f.write('.file-size-baseline.json', baseline({}));
  f.commit();
  const result = f.check('HEAD');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /full commit SHA/);
});
