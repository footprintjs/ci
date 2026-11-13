// How a plan step ENDS, run as the workflow runs it: the committed bundle (dist/release-route.cjs)
// and the plain script (scripts/release-route.mjs) in a child process, against a real git
// repository and the saved npm and GitHub answers (answers-from-fixtures.mjs). Whichever write of
// the step's end fails, a step that exits 1 leaves no `mode` and no `compare` in GITHUB_OUTPUT
// (report.mjs · end). The same cases in this process, with a writer that throws: step-end.test.mjs.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { FILES, TOOL } from '../storydeck-today.mjs';

const RUNNERS = { bundle: resolve('dist/release-route.cjs'), plain: resolve('scripts/release-route.mjs') };
const ANSWERS = resolve('test/release-route/chart/answers-from-fixtures.mjs');
const DISK_FULL = resolve('test/release-route/chart/output-write-fails.cjs');
const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'route test', GIT_AUTHOR_EMAIL: 'route@test.invalid',
  GIT_COMMITTER_NAME: 'route test', GIT_COMMITTER_EMAIL: 'route@test.invalid' };
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-end-bundle-'));
  t.after(() => { chmodSync(dir, 0o700); rmSync(dir, { recursive: true, force: true }); });
  return dir;
};
const read = (path) => { try { return statSync(path).isFile() ? readFileSync(path, 'utf8') : '<not a file>'; } catch { return '<none>'; } };

// storydeck 0.13.2 with its section, committed on main, no tag; origin is the repository itself.
function repository(dir) {
  const repo = join(dir, 'repo');
  mkdirSync(join(repo, '.github'), { recursive: true });
  writeFileSync(join(repo, 'package.json'), FILES['package.json'].toString().replace('"version": "0.13.1"', '"version": "0.13.2"'));
  writeFileSync(join(repo, 'CHANGELOG.md'), FILES['CHANGELOG.md'].toString().replace('# Changelog\n', '# Changelog\n\n## 0.13.2 \u{2014} t\n\n- x\n'));
  writeFileSync(join(repo, '.github', 'release.json'), FILES['.github/release.json']);
  mkdirSync(join(repo, '.github', 'workflows'));
  for (const name of ['publish.yml', 'release-check.yml']) writeFileSync(join(repo, '.github', 'workflows', name), FILES[`.github/workflows/${name}`]);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { env: { PATH: process.env.PATH, ...GIT_ENV }, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('commit', '-q', '-m', 'release 0.13.2');
  git('remote', 'add', 'origin', repo);
  return { repo, commit: git('rev-parse', 'HEAD').trim() };
}

function plan(t, runner, setup = (dir) => ({}), preload = []) {
  const dir = folder(t);
  const { repo, commit } = repository(dir);
  const env = { PATH: process.env.PATH, ...GIT_ENV, ROUTE_SOURCE: repo, GITHUB_SHA: commit, GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish',
    ROUTE_TOOL_SHA: TOOL, GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
  Object.assign(env, setup(dir));
  const result = spawnSync(process.execPath, ['--import', ANSWERS, ...preload, RUNNERS[runner], 'plan'], { encoding: 'utf8', env, timeout: 30_000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: read(env.GITHUB_OUTPUT) };
}

for (const runner of Object.keys(RUNNERS)) {
  test(`${runner}: the pass writes the four names, node, latest, compare, and mode as the last line`, (t) => {
    const result = plan(t, runner);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.output, /^rule=publish\ncommit=[0-9a-f]{40}\npackage=footprint-storydeck\nversion=0\.13\.2\nnode=22\nlatest=yes\ncompare=yes\nmode=publish\n$/);
  });

  const SUMMARY_FAILS = {
    'a folder': (dir) => { mkdirSync(join(dir, 'summary')); return {}; },
    'a read-only file': (dir) => { writeFileSync(join(dir, 'summary'), ''); chmodSync(join(dir, 'summary'), 0o400); return {}; },
    'under a missing folder': (dir) => ({ GITHUB_STEP_SUMMARY: join(dir, 'missing', 'summary') }),
  };
  for (const [label, setup] of Object.entries(SUMMARY_FAILS))
    test(`${runner}: the summary path is ${label}: exit 1, and GITHUB_OUTPUT holds no mode and no compare`, { skip: asRoot && label === 'a read-only file' }, (t) => {
      const result = plan(t, runner, setup);
      assert.equal(result.code, 1, result.stdout + result.stderr);
      assert.equal(result.output, '<none>');
      assert.match(result.stdout, /^Decision: rule publish gives mode publish/m, 'the plan did decide to publish');
      assert.match(result.stdout, /^Refused: unexpected-failure\./m);
      assert.equal(result.stderr, '');
    });

  test(`${runner}: GITHUB_OUTPUT is a folder: exit 1, and nothing is written`, (t) => {
    const result = plan(t, runner, (dir) => { mkdirSync(join(dir, 'out')); return {}; });
    assert.equal(result.code, 1);
    assert.equal(result.output, '<not a file>');
    assert.match(result.stdout, /^Refused: unexpected-failure\./m);
  });

  test(`${runner}: the disk fills 3 bytes before the end of the output append: exit 1, and GITHUB_OUTPUT is left as it was`, (t) => {
    const result = plan(t, runner, (dir) => { writeFileSync(join(dir, 'out'), 'earlier=yes\n'); return {}; }, ['--require', DISK_FULL]);
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.equal(result.output, 'earlier=yes\n');
    assert.match(result.stdout, /^Refused: unexpected-failure\./m);
  });
}
