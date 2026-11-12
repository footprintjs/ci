// Observe, then plan, against recorded real answers. The storydeck case is the family as it is
// today: storydeck main a3936e3 (package.json and CHANGELOG.md are the real blobs), the tag list
// from `git ls-remote` on github.com, npm's real package document, and GitHub's real compare
// answer for a ci commit on main, all saved 2026-11-12. The one thing storydeck does not have yet
// is .github/release.json: the test adds the file its pull request A will add (design section 2).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { observe } from '../../src/release-route/observe.mjs';
import { plan } from '../../src/release-route/plan.mjs';
import { blobId, recordedGit } from './recorded-git.mjs';
import { fakeFetch, json } from './fake-fetch.mjs';

const fixture = (path) => readFileSync(new URL(`fixtures/${path}`, import.meta.url));
const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
const TOOL = '1df988109047e3143c71bf459f3e10c968376e13';
const today = {
  'package.json': fixture('storydeck-today/package.json'),
  'CHANGELOG.md': fixture('storydeck-today/CHANGELOG.md'),
  '.github/release.json': fixture('family/storydeck.release.json'),
};
const npmRoutes = {
  'https://registry.npmjs.org/footprint-storydeck': json(fixture('npm/footprint-storydeck.abbrev.json').toString()),
  [`https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`]: json(fixture('github/compare-behind.json').toString()),
};
const env = (extra = {}) => ({ GITHUB_SHA: COMMIT, GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish', ROUTE_TOOL_SHA: TOOL, ...extra });
// The tip of main as github.com answered on 2026-11-12 (`git ls-remote origin refs/heads/main`).
const TIP = fixture('storydeck-today/ls-remote-main.txt').toString().split('\t')[0];
async function run({ files = today, lsRemote = fixture('storydeck-today/ls-remote.txt').toString(), routes = npmRoutes, extra, mainTip = TIP } = {}) {
  const { git } = recordedGit({ commit: COMMIT, files, lsRemote, mainTip });
  const observed = await observe({ env: env(extra), git, fetcher: fakeFetch(routes).fetcher });
  return { observed, result: plan({ facts: observed.facts }) };
}

test('the fixtures are the real storydeck blobs at a3936e3', () => {
  assert.equal(blobId(today['package.json']), '0a134d3e17fe5811fef85cb5a8518842b9ec0f51');
  assert.equal(blobId(today['CHANGELOG.md']), '6c967696db5752073ac3313952345e3db6f45d75');
});

test('footprint-storydeck 0.13.1 on main today: nothing to do', async () => {
  const { observed, result } = await run();
  assert.deepEqual(observed.facts, { action: 'publish', refIsMain: true, commitIsMainTip: true, toolCommitPlain: true, toolReviewed: true, settingsRead: true,
    packageNamed: true, packagePrivate: false, versionPlain: true, tagExists: true, packageKnown: true, npmHasVersion: true,
    versionNewer: false, changelogFound: true });
  assert.deepEqual([result.rule, result.mode], ['released', 'nothing']);
  assert.deepEqual(observed.context, { commit: COMMIT, name: 'footprint-storydeck', version: '0.13.1' });
});

test('the same day as a dry run compares the rebuild with npm', async () => {
  const { result } = await run({ extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/some-branch' } });
  assert.deepEqual([result.rule, result.mode, result.compare], ['dry-run-released', 'dry-run', 'yes']);
});

const bumped = (version, changelogHead) => ({
  ...today,
  'package.json': Buffer.from(today['package.json'].toString().replace('"version": "0.13.1"', `"version": "${version}"`)),
  'CHANGELOG.md': Buffer.from(today['CHANGELOG.md'].toString().replace('# Changelog\n', `# Changelog\n${changelogHead}`)),
});

test('0.13.2 with its section, no tag, on main: publish; from a branch as a dry run: would publish', async () => {
  const files = bumped('0.13.2', '\n## 0.13.2 \u{2014} a test\n\n- x\n');
  assert.equal((await run({ files, lsRemote: '' })).result.rule, 'publish');
  assert.equal((await run({ files, lsRemote: '', extra: { GITHUB_REF: 'refs/heads/x' } })).result.rule, 'publish-off-main');
  const dry = await run({ files, lsRemote: '', extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/x' } });
  assert.deepEqual([dry.result.rule, dry.result.compare], ['dry-run-would-publish', 'no']);
  assert.equal((await run({ files: bumped('0.13.2', ''), lsRemote: '' })).result.rule, 'changelog-missing');
  assert.equal((await run({ files: bumped('0.12.9', '\n## 0.12.9 \u{2014} old\n- x\n'), lsRemote: '' })).result.rule, 'version-not-newer');
});

test('the tip of main is measured: a run of an older commit of main does nothing, a run with no readable tip refuses', async () => {
  assert.equal(TIP, COMMIT);
  const files = bumped('0.13.2', '\n## 0.13.2 \u{2014} a test\n\n- x\n');
  const old = await run({ files, lsRemote: '', mainTip: 'f'.repeat(40) });
  assert.equal(old.observed.facts.commitIsMainTip, false);
  assert.deepEqual([old.result.rule, old.result.mode], ['not-main-tip', 'nothing']);
  const noMain = await run({ mainTip: null });
  assert.deepEqual([noMain.observed.causes.commitIsMainTip.code, noMain.result.rule], ['git-failed', 'facts-unreadable']);
  const dry = await run({ files, lsRemote: '', mainTip: 'f'.repeat(40), extra: { ROUTE_ACTION: 'dry-run' } });
  assert.equal(dry.result.rule, 'dry-run-would-publish');
});

test('an unreadable fact is null with its refusal kept, and the plan refuses naming it', async () => {
  const noSettings = { ...today };
  delete noSettings['.github/release.json'];
  const { observed, result } = await run({ files: noSettings });
  assert.equal(observed.facts.settingsRead, null);
  assert.equal(observed.causes.settingsRead.code, 'settings-unreadable');
  assert.equal(result.rule, 'facts-unreadable');

  const badTags = await run({ lsRemote: 'garbage\n' });
  assert.equal(badTags.observed.causes.tagExists.code, 'git-failed');
  assert.equal(badTags.result.refuse, 'fact-unreadable');

  const npmDown = await run({ routes: { ...npmRoutes, 'https://registry.npmjs.org/footprint-storydeck': json({}, 503) } });
  assert.equal(npmDown.observed.causes.packageKnown.code, 'response-status');
  assert.equal(npmDown.result.refuse, 'fact-unreadable');

  const githubDown = await run({ routes: { 'https://registry.npmjs.org/footprint-storydeck': npmRoutes['https://registry.npmjs.org/footprint-storydeck'] } });
  assert.equal(githubDown.observed.causes.toolReviewed.code, 'request-failed');
  assert.equal(githubDown.result.refuse, 'fact-unreadable');
});

test('the package facts: private, no name, a bad name, a bad private, a prerelease, an unknown package', async () => {
  const pkg = (change) => ({ ...today, 'package.json': Buffer.from(JSON.stringify({ ...JSON.parse(today['package.json']), ...change })) });
  assert.equal((await run({ files: pkg({ private: true }) })).result.rule, 'package-private');
  assert.equal((await run({ files: pkg({ name: undefined }) })).result.rule, 'package-unnamed');
  const badName = await run({ files: pkg({ name: 'Bad Name' }) });
  assert.equal(badName.observed.causes.packageNamed.code, 'package-name-invalid');
  assert.equal((await run({ files: pkg({ private: 'yes' }) })).observed.causes.packagePrivate.detail, 'private');
  assert.equal((await run({ files: pkg({ version: '0.14.0-rc.0' }) })).result.rule, 'version-not-plain');
  const unknown = await run({ routes: { ...npmRoutes, 'https://registry.npmjs.org/footprint-storydeck': json({}, 404) } });
  assert.equal(unknown.result.rule, 'package-unknown');
  const dup = await run({ files: { ...today, 'package.json': Buffer.from('{"name":"a","name":"a","version":"1.0.0"}') } });
  assert.equal(dup.observed.causes.packageNamed.code, 'package-json');
  const symlink = recordedGit({ commit: COMMIT, files: today, modes: { 'package.json': '120000 blob' } });
  const linked = await observe({ env: env(), git: symlink.git, fetcher: fakeFetch(npmRoutes).fetcher });
  assert.equal(linked.causes.packageNamed.code, 'package-unreadable');
});

test('the tool commit: not plain, or not on ci main', async () => {
  assert.equal((await run({ extra: { ROUTE_TOOL_SHA: '' } })).result.rule, 'tool-commit-invalid');
  const ahead = { ...npmRoutes, [`https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`]: json({ status: 'ahead', merge_base_commit: { sha: 'b'.repeat(40) } }) };
  assert.equal((await run({ routes: ahead })).result.rule, 'tool-not-reviewed');
});

test('a malformed GITHUB_SHA stops before anything is read', async () => {
  const { git, calls } = recordedGit({ commit: COMMIT, files: today });
  await assert.rejects(observe({ env: env({ GITHUB_SHA: 'main' }), git, fetcher: fakeFetch({}).fetcher }), (e) => e.code === 'input-invalid');
  assert.equal(calls.length, 0);
});
