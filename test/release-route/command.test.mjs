// The command end to end: the script as a process (unknown step, bad inputs, no network), and
// runStep with recorded doors for each step.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runStep } from '../../src/release-route/command.mjs';
import { integrityOf } from '../../src/release-route/registry.mjs';
import { createReport } from '../../src/release-route/report.mjs';
import fixture from './archive/fixture.cjs';
import { fakeFetch, json, bytes } from './fake-fetch.mjs';
import { recordedGit } from './recorded-git.mjs';

const cli = resolve('scripts/release-route.mjs');
const runCli = (args, env = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
const saved = (path) => readFileSync(new URL(`fixtures/${path}`, import.meta.url));
const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
const TOOL = '1df988109047e3143c71bf459f3e10c968376e13';
const storydeck = { 'package.json': saved('storydeck-today/package.json'), 'CHANGELOG.md': saved('storydeck-today/CHANGELOG.md'),
  '.github/release.json': saved('family/storydeck.release.json') };
const routes = {
  'https://registry.npmjs.org/footprint-storydeck': json(saved('npm/footprint-storydeck.abbrev.json').toString()),
  [`https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`]: json(saved('github/compare-behind.json').toString()),
  'https://api.github.com/repos/footprintjs/storydeck/releases/tags/v0.13.1': json(saved('github/release-storydeck-v0.13.1.json').toString()),
};
const PLAN_ENV = { GITHUB_SHA: COMMIT, GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish', ROUTE_TOOL_SHA: TOOL, GITHUB_REPOSITORY: 'footprintjs/storydeck' };
function doors(env, { files = storydeck, lsRemote = saved('storydeck-today/ls-remote.txt').toString(), fetched = routes, mainTip = COMMIT } = {}) {
  const written = {};
  const printed = [];
  const report = createReport({ env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, print: (l) => printed.push(l),
    append: (p, text) => { written[p] = (written[p] ?? '') + text; }, appendOutputs: (p, text) => { written[p] = (written[p] ?? '') + text; } });
  return { doors: { env, git: recordedGit({ commit: COMMIT, files, lsRemote, mainTip }).git, fetcher: fakeFetch(fetched).fetcher, sleep: async () => {}, report }, written, printed };
}
const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-cmd-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('the script: an unknown or missing step is refused with exit 1', () => {
  for (const args of [['ship'], [], ['__proto__'], ['PLAN']]) {
    const result = runCli(args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stdout, /^Refused: unknown-step\. The step is not one this command runs \(the plain command: plan, npm-tool, build, inspect, ready, verify, tag, notes; the bundle: plan, verify, why\)\.$/m);
  }
});

test('the script: malformed inputs stop before git or the network', () => {
  const plan = runCli(['plan'], { GITHUB_SHA: 'main' });
  assert.equal(plan.status, 1);
  assert.match(plan.stdout, /Refused: input-invalid\..*\nDetail: GITHUB_SHA/);
  const verify = runCli(['verify'], { ROUTE_PACKAGE: 'x', ROUTE_VERSION: '1.0.0\nmode=publish' });
  assert.match(verify.stdout, /Detail: ROUTE_VERSION/);
  const build = runCli(['build'], { ROUTE_COMMIT: 'HEAD' });
  assert.match(build.stdout, /Detail: ROUTE_COMMIT/);
});

test('the script writes outputs and summary only to the runner files, and masks a token', (t) => {
  const dir = folder(t);
  const result = runCli(['nope-::-step'], { GITHUB_OUTPUT: join(dir, 'out'), GITHUB_STEP_SUMMARY: join(dir, 'summary'), GITHUB_TOKEN: 'ghs_secretsecret' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Detail: nope-: :-step/);
  assert.match(readFileSync(join(dir, 'summary'), 'utf8'), /^<pre>\nRefused: unknown-step/);
});

test('plan for storydeck today: nothing, exit 0, closed outputs', async () => {
  const { doors: d, written, printed } = doors(PLAN_ENV);
  assert.equal(await runStep('plan', d), 0);
  assert.equal(written.out, `rule=released\ncommit=${COMMIT}\npackage=footprint-storydeck\nversion=0.13.1\nnode=22\nlatest=yes\ncompare=no\nmode=nothing\n`);
  assert.equal(printed.at(-1), 'Decision: rule released gives mode nothing, nothing to do: the version is tagged, on npm and has its GitHub release.');
  assert.match(written.summary, /Facts seen: action=publish, .*tagExists=true, tagAtCommit=false, releaseExists=true/);
  // The same sentence reaches the job summary.
  assert.match(written.summary, /Decision: rule released gives mode nothing, nothing to do: the version is tagged, on npm and has its GitHub release\./);
});

// Correction 5: a workflow file that pins the route at another commit is refused by name, with the
// file and the pin it found (cleaned), before anything else is decided.
test('plan refuses pins-differ, naming the file and the pin, and writes no mode', async () => {
  const files = { ...storydeck,
    '.github/workflows/publish.yml': Buffer.from(`jobs:\n  release:\n    uses: footprintjs/ci/.github/workflows/release-route.yml@${TOOL} # pinned\n`),
    '.github/workflows/ci.yml': Buffer.from(`jobs:\n  release-check:\n    uses: footprintjs/ci/.github/workflows/release-check.yml@${'b'.repeat(40)}\n`) };
  const { doors: d, written, printed } = doors(PLAN_ENV, { files });
  assert.equal(await runStep('plan', d), 1);
  assert.doesNotMatch(written.out, /mode=/);
  assert.ok(printed.includes('Decision: rule pins-differ refuses pins-differ, a workflow file of this repository pins the release route at another commit than the one running.'), printed.join('\n'));
  assert.ok(printed.includes(`Detail: rule pins-differ: ci.yml pins ${'b'.repeat(40)}`), printed.join('\n'));
  // Both files at the commit running: the plan goes on and decides.
  const agreeing = { ...files, '.github/workflows/ci.yml': Buffer.from(`    uses: footprintjs/ci/.github/workflows/release-check.yml@${TOOL}\n`) };
  assert.equal(await runStep('plan', doors(PLAN_ENV, { files: agreeing }).doors), 0);
});

// The build job sets up the Node major the settings name before it starts (it cannot read the
// settings itself without running a step first), so the plan hands it on: written with the passing
// outputs, before compare and mode, and never by a refused plan, even one that read the settings.
test('plan hands the settings\' Node major to the build job as `node`, only when it passes', async () => {
  const settings = JSON.parse(storydeck['.github/release.json']);
  const files = { ...storydeck, '.github/release.json': Buffer.from(JSON.stringify({ ...settings, node: '24' })) };
  const env = PLAN_ENV;
  const passed = doors(env, { files });
  assert.equal(await runStep('plan', passed.doors), 0, passed.printed.join('\n'));
  assert.equal(passed.written.out, `rule=released\ncommit=${COMMIT}\npackage=footprint-storydeck\nversion=0.13.1\nnode=24\nlatest=yes\ncompare=no\nmode=nothing\n`);
  // A refusal by the first row: the settings were read (the build would have had its Node), and still no node.
  const refused = doors({ ...env, ROUTE_TOOL_SHA: 'main' }, { files });
  assert.equal(await runStep('plan', refused.doors), 1);
  assert.equal(refused.written.out, `rule=tool-commit-invalid\ncommit=${COMMIT}\npackage=footprint-storydeck\nversion=0.13.1\n`);
});

test('plan refused: exit 1, no mode written, the unreadable fact and its cause printed', async () => {
  const { '.github/release.json': _, ...noSettings } = storydeck;
  const { doors: d, written, printed } = doors(PLAN_ENV, { files: noSettings });
  assert.equal(await runStep('plan', d), 1);
  assert.doesNotMatch(written.out, /mode=|node=/);
  assert.ok(printed.some((l) => l.startsWith('Unreadable fact settingsRead: settings-unreadable')));
  assert.ok(printed.includes('Detail: settingsRead'));
});

test('inspect and verify on a built tarball; notes to files', async (t) => {
  const manifest = JSON.parse(storydeck['package.json']);
  const tgz = fixture.pack(manifest, ['plugin/x.md', 'site/public/deck-stage.js', 'CHANGELOG.md'].map((p) => fixture.entry(`package/${p}`, 'x')));
  const intake = join(folder(t), 'tarball');
  mkdirSync(intake);
  writeFileSync(join(intake, 'package.tgz'), tgz);
  const inspect = doors({ ROUTE_COMMIT: COMMIT, ROUTE_TARBALL_DIR: intake });
  assert.equal(await runStep('inspect', inspect.doors), 0, inspect.printed.join('\n'));
  assert.match(inspect.printed[0], /^Inspected footprint-storydeck 0\.13\.1: 5 files, all allowed, sha512-/);

  const V = 'https://registry.npmjs.org/footprint-storydeck/0.13.1';
  const tarball = 'https://registry.npmjs.org/footprint-storydeck/-/footprint-storydeck-0.13.1.tgz';
  const doc = { name: 'footprint-storydeck', version: '0.13.1', dist: { integrity: integrityOf(tgz), tarball } };
  const verify = doors({ ROUTE_PACKAGE: 'footprint-storydeck', ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: intake }, { fetched: { [V]: json(doc), [tarball]: bytes(tgz) } });
  assert.equal(await runStep('verify', verify.doors), 0, verify.printed.join('\n'));
  const differs = doors({ ROUTE_PACKAGE: 'footprint-storydeck', ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: intake },
    { fetched: { [V]: json({ ...doc, dist: { ...doc.dist, integrity: integrityOf(Buffer.from('other')) } }), [tarball]: bytes(tgz) } });
  assert.equal(await runStep('verify', differs.doors), 1);
  assert.equal(differs.printed[0], `Refused: registry-differs. npm serves different bytes for this version than the file the route built.`);

  const out = join(folder(t), 'notes');
  const notes = doors({ ROUTE_COMMIT: COMMIT, ROUTE_OUT: out });
  assert.equal(await runStep('notes', notes.doors), 0);
  assert.equal(notes.written.out, 'title-file=title.txt\nnotes-file=notes.md\n');
  assert.equal(readFileSync(join(out, 'title.txt'), 'utf8'), 'v0.13.1 \u{2014} works beside footprintjs 12\n');
});

test('a failing git is git-failed; an exception the route has no name for is unexpected-failure; both exit 1', async () => {
  const { doors: d, printed } = doors({ ROUTE_COMMIT: COMMIT, ROUTE_OUT: '/x' });
  assert.equal(await runStep('notes', { ...d, git: () => { throw new Error('boom'); } }), 1);
  assert.match(printed[0], /^Refused: git-failed\./);
  const env = new Proxy({}, { get() { throw new TypeError('boom'); } });
  assert.equal(await runStep('notes', { ...d, env }), 1);
  assert.match(printed.at(-1), /^Refused: unexpected-failure\./);
  const broken = { ...d, report: { ...d.report, say: d.report.say, summary: () => { throw new Error('disk full'); } } };
  assert.equal(await runStep('unknown', broken), 1);
});

// B1: "Re-run failed jobs" reuses the old plan's outputs. ready measures again, when npm lacks the
// version, that the planned commit is still the tip of main and the version still the newest; a
// stale plan is refused by name and writes no `publish`.
test('ready refuses a stale plan from a re-run: an old commit, a version no longer the newest; npm having the bytes still finishes', async (t) => {
  const intake = join(folder(t), 'tarball');
  mkdirSync(intake);
  const tgz = Buffer.from('built');
  writeFileSync(join(intake, 'package.tgz'), tgz);
  const V = 'https://registry.npmjs.org/footprint-storydeck/0.13.2';
  const P = 'https://registry.npmjs.org/footprint-storydeck';
  const env = { ROUTE_PACKAGE: 'footprint-storydeck', ROUTE_VERSION: '0.13.2', ROUTE_TARBALL_DIR: intake, ROUTE_COMMIT: COMMIT };
  const newer = json({ name: 'footprint-storydeck', versions: { '0.13.1': { version: '0.13.1' }, '0.14.0': { version: '0.14.0' } } });
  for (const [label, options, detail] of [
    ['main moved on', { mainTip: 'b'.repeat(40), fetched: { [V]: json({}, 404), [P]: routes[P] } }, 'commitIsMainTip'],
    ['a newer version is on npm', { fetched: { [V]: json({}, 404), [P]: newer } }, 'versionNewer'],
  ]) {
    const run = doors(env, options);
    assert.equal(await runStep('ready', run.doors), 1, label);
    assert.match(run.printed[0], /^Refused: plan-stale\. /, label);
    assert.equal(run.printed[1], `Detail: ${detail}`, label);
    assert.equal(run.written.out, undefined, `${label}: no publish output`);
  }
  // npm already has exactly these bytes: publish=no whatever main is now (an unfinished release is finished).
  const tarball = 'https://registry.npmjs.org/footprint-storydeck/-/footprint-storydeck-0.13.2.tgz';
  const has = doors(env, { mainTip: 'b'.repeat(40), fetched: { [V]: json({ name: 'footprint-storydeck', version: '0.13.2', dist: { integrity: integrityOf(tgz), tarball } }), [tarball]: bytes(tgz) } });
  assert.equal(await runStep('ready', has.doors), 0, has.printed.join('\n'));
  assert.equal(has.written.out, 'publish=no\n');
  // ROUTE_COMMIT is required.
  const { ROUTE_COMMIT, ...noCommit } = env;
  const missing = doors(noCommit, { fetched: { [V]: json({}, 404), [P]: routes[P] } });
  assert.equal(await runStep('ready', missing.doors), 1);
  assert.equal(missing.printed.at(-1), 'Detail: ROUTE_COMMIT');
});

test('ready, tag and npm-tool as steps: closed outputs, and a refusal is exit 1', async (t) => {
  const intake = join(folder(t), 'tarball');
  mkdirSync(intake);
  const tgz = Buffer.from('built');
  writeFileSync(join(intake, 'package.tgz'), tgz);
  const V = 'https://registry.npmjs.org/footprint-storydeck/0.13.2';
  const packument = routes['https://registry.npmjs.org/footprint-storydeck'];
  const readyEnv = { ROUTE_PACKAGE: 'footprint-storydeck', ROUTE_VERSION: '0.13.2', ROUTE_TARBALL_DIR: intake, ROUTE_COMMIT: COMMIT };
  const r1 = doors(readyEnv, { fetched: { [V]: json({}, 404), 'https://registry.npmjs.org/footprint-storydeck': packument } });
  assert.equal(await runStep('ready', r1.doors), 0, r1.printed.join('\n'));
  assert.equal(r1.written.out, 'publish=yes\n');

  const releaseUrl = 'https://api.github.com/repos/footprintjs/storydeck/releases/tags/v0.13.1';
  const tagEnv = { ROUTE_COMMIT: COMMIT, ROUTE_VERSION: '0.13.1', ROUTE_MODE: 'publish', GITHUB_REPOSITORY: 'footprintjs/storydeck' };
  const r2 = doors(tagEnv, { lsRemote: `${'e'.repeat(40)}\trefs/tags/v0.13.1\n`, fetched: { [releaseUrl]: json({}, 404) } });
  assert.equal(await runStep('tag', r2.doors), 1);
  assert.match(r2.printed[0], /^Refused: tag-elsewhere\./);
  const r3 = doors(tagEnv, { lsRemote: '', fetched: { [releaseUrl]: json({}, 404) } });
  assert.equal(await runStep('tag', r3.doors), 0);
  assert.equal(r3.written.out, 'tag=create\nrelease=create\n');
  // Correction 7: in mode finish the tag must already be at the commit; a missing tag is never created.
  const finish = doors({ ...tagEnv, ROUTE_MODE: 'finish' }, { lsRemote: `${COMMIT}\trefs/tags/v0.13.1\n`, fetched: { [releaseUrl]: json({}, 404) } });
  assert.equal(await runStep('tag', finish.doors), 0, finish.printed.join('\n'));
  assert.equal(finish.written.out, 'tag=skip\nrelease=create\n');
  const gone = doors({ ...tagEnv, ROUTE_MODE: 'finish' }, { lsRemote: '', fetched: { [releaseUrl]: json({}, 404) } });
  assert.equal(await runStep('tag', gone.doors), 1);
  assert.match(gone.printed[0], /^Refused: tag-gone\./);
  assert.equal(gone.written.out, undefined);
  for (const mode of [undefined, '', 'dry-run', 'nothing', 'finish '])
    assert.equal(await runStep('tag', doors({ ...tagEnv, ROUTE_MODE: mode }, { lsRemote: '', fetched: { [releaseUrl]: json({}, 404) } }).doors), 1, String(mode));

  const npmDir = join(folder(t), 'npm');
  const r4 = doors({ ROUTE_NPM_DIR: npmDir, ROUTE_SOURCE: process.cwd() });
  assert.equal(await runStep('npm-tool', r4.doors), 0, r4.printed.join('\n'));
  assert.match(r4.printed[0], /^Unpacked the pinned npm 11\.19\.0 \(1943 files/);
  assert.equal(await runStep('npm-tool', doors({ ROUTE_NPM_DIR: npmDir, ROUTE_SOURCE: process.cwd() }).doors), 1);
});
