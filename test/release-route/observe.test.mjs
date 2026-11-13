// Observe, then plan, against recorded real answers. The storydeck case is the family as it is
// today: storydeck main a3936e3 (package.json and CHANGELOG.md are the real blobs, the author value
// made neutral), the tag list
// from `git ls-remote` on github.com, npm's real package document, and GitHub's real compare
// answer for a ci commit on main, all saved 2026-11-12. The one thing storydeck does not have yet
// is .github/release.json: the test adds the file its pull request A will add (design section 2).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { observe } from '../../src/release-route/observe.mjs';
import { plan } from '../../src/release-route/plan.mjs';
import { blobId, recordedGit } from './recorded-git.mjs';
import { fakeFetch, json } from './fake-fetch.mjs';
import { WORKFLOWS } from './storydeck-today.mjs';

const fixture = (path) => readFileSync(new URL(`fixtures/${path}`, import.meta.url));
const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
const TOOL = '1df988109047e3143c71bf459f3e10c968376e13';
// GitHub's release for tag v0.13.1, read 2026-11-13 (trimmed to four fields).
const RELEASE = 'https://api.github.com/repos/footprintjs/storydeck/releases/tags/v0.13.1';
const today = {
  'package.json': fixture('storydeck-today/package.json'),
  'CHANGELOG.md': fixture('storydeck-today/CHANGELOG.md'),
  '.github/release.json': fixture('family/storydeck.release.json'),
  // storydeck's two caller files (main d7eef62), pinned at the tool commit of these runs.
  ...WORKFLOWS,
};
const npmRoutes = {
  'https://registry.npmjs.org/footprint-storydeck': json(fixture('npm/footprint-storydeck.abbrev.json').toString()),
  [`https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`]: json(fixture('github/compare-behind.json').toString()),
  [RELEASE]: json(fixture('github/release-storydeck-v0.13.1.json').toString()),
};
const env = (extra = {}) => ({ GITHUB_SHA: COMMIT, GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish', ROUTE_TOOL_SHA: TOOL,
  GITHUB_REPOSITORY: 'footprintjs/storydeck', ...extra });
// The tip of main as github.com answered on 2026-11-12 (`git ls-remote origin refs/heads/main`).
const TIP = fixture('storydeck-today/ls-remote-main.txt').toString().split('\t')[0];
async function run({ files = today, lsRemote = fixture('storydeck-today/ls-remote.txt').toString(), routes = npmRoutes, extra, mainTip = TIP } = {}) {
  const { git } = recordedGit({ commit: COMMIT, files, lsRemote, mainTip });
  const observed = await observe({ env: env(extra), git, fetcher: fakeFetch(routes).fetcher });
  return { observed, result: plan({ facts: observed.facts }) };
}

test('the fixtures are the real storydeck blobs at a3936e3 (package.json with its author value made neutral)', () => {
  // The real package.json blob is 0a134d3e17fe5811fef85cb5a8518842b9ec0f51; its "author" value is
  // replaced by a neutral string so no person's name is kept in a fixture, so it is pinned by
  // its own hash here. No test reads the author.
  assert.equal(createHash('sha256').update(today['package.json']).digest('hex'), 'dc1a7e2ef32048b8334bf1ff323c32ef5fd1598fe0378683bc0e1acb72f67ba1');
  assert.equal(JSON.parse(today['package.json']).author, 'Package Author');
  assert.equal(blobId(today['CHANGELOG.md']), '6c967696db5752073ac3313952345e3db6f45d75');
});

test('footprint-storydeck 0.13.1 on main today: nothing to do', async () => {
  const { observed, result } = await run();
  assert.deepEqual(observed.facts, { action: 'publish', refIsMain: true, commitIsMainTip: true, toolCommitPlain: true, toolReviewed: true, settingsRead: true,
    packageNamed: true, packagePrivate: false, versionPlain: true, pinsAgree: true, tagExists: true, tagAtCommit: false, releaseExists: true,
    packageKnown: true, npmHasVersion: true, versionNewer: false, changelogFound: true });
  assert.deepEqual([result.rule, result.mode], ['released', 'nothing']);
  assert.deepEqual(observed.context, { commit: COMMIT, name: 'footprint-storydeck', version: '0.13.1', changelogStyle: 'titled', node: '22', latest: 'yes' });
});

// Correction 1, the fault itself: main a3936e3 is a later commit than the one tagged v0.13.1
// (c94c2a6), and two of its shipped files differ from what npm serves, so a compare could only be
// red (storydeck runs 43334890647 and 43336400518). This case planned compare=yes before.
test('the same day as a dry run: the tag names another commit, so nothing is compared with npm', async () => {
  const { observed, result } = await run({ extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/some-branch' } });
  assert.equal(observed.facts.tagAtCommit, false);
  assert.deepEqual([result.rule, result.mode, result.compare], ['dry-run-not-released-commit', 'dry-run', 'no']);
});

test('a dry run AT the tagged commit compares the rebuild with npm (a real reproducibility check)', async () => {
  const tagged = `${COMMIT}\trefs/tags/v0.13.1\n`;
  const { observed, result } = await run({ lsRemote: tagged, extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/some-branch' } });
  assert.equal(observed.facts.tagAtCommit, true);
  assert.deepEqual([result.rule, result.mode, result.compare], ['dry-run-released', 'dry-run', 'yes']);
  // An annotated tag is read by its peeled line, the commit it names.
  const annotated = `${'e'.repeat(40)}\trefs/tags/v0.13.1\n${COMMIT}\trefs/tags/v0.13.1^{}\n`;
  assert.equal((await run({ lsRemote: annotated })).observed.facts.tagAtCommit, true);
});

// Correction 7: the tag and npm have the version but GitHub has no release.
test('no GitHub release for the tag: finish at the tagged commit, a named refusal at a later tip, unreadable when GitHub does not answer', async () => {
  const tagged = `${COMMIT}\trefs/tags/v0.13.1\n`;
  const missing = { ...npmRoutes, [RELEASE]: json({ message: 'Not Found' }, 404) };
  const finish = await run({ lsRemote: tagged, routes: missing });
  assert.deepEqual([finish.observed.facts.releaseExists, finish.result.rule, finish.result.mode, finish.result.compare], [false, 'finish', 'finish', 'no']);
  const later = await run({ routes: missing });
  assert.deepEqual([later.result.rule, later.result.refuse], ['finish-tag-elsewhere', 'tag-elsewhere']);
  const offMain = await run({ lsRemote: tagged, routes: missing, extra: { GITHUB_REF: 'refs/heads/x' } });
  assert.deepEqual([offMain.result.rule, offMain.result.refuse], ['finish-off-main', 'finish-off-main']);
  const old = await run({ lsRemote: tagged, routes: missing, mainTip: 'f'.repeat(40) });
  assert.deepEqual([old.result.rule, old.result.mode], ['finish-not-tip', 'nothing']);
  const down = await run({ routes: { ...npmRoutes, [RELEASE]: json({}, 502) } });
  assert.deepEqual([down.observed.facts.releaseExists, down.observed.causes.releaseExists.code, down.result.rule], [null, 'response-status', 'facts-unreadable']);
  const other = await run({ routes: { ...npmRoutes, [RELEASE]: json({ tag_name: 'v0.13.0', draft: false }) } });
  assert.deepEqual([other.observed.causes.releaseExists.code, other.result.rule], ['release-unexpected', 'facts-unreadable']);
  // No tag: nothing is asked of GitHub's releases, and the facts are false.
  const files = bumped('0.13.2', '\n## 0.13.2 \u2014 a test\n\n- x\n');
  const { fetcher, calls } = fakeFetch(npmRoutes);
  const observed = await observe({ env: env(), git: recordedGit({ commit: COMMIT, files, lsRemote: '', mainTip: TIP }).git, fetcher });
  assert.deepEqual([observed.facts.tagExists, observed.facts.tagAtCommit, observed.facts.releaseExists], [false, false, false]);
  assert.equal(calls.some((call) => call.url.includes('/releases/')), false);
  // The token goes to the fixed host in one header.
  const asked = fakeFetch({ ...npmRoutes });
  await observe({ env: env({ GITHUB_TOKEN: 'ghs_x' }), git: recordedGit({ commit: COMMIT, files: today, lsRemote: fixture('storydeck-today/ls-remote.txt').toString(), mainTip: TIP }).git,
    fetcher: asked.fetcher });
  const releaseCall = asked.calls.find((call) => call.url === RELEASE);
  assert.equal(releaseCall.headers.authorization, 'Bearer ghs_x');
  // A bad repository name is never put in a URL.
  const badRepo = await run({ extra: { GITHUB_REPOSITORY: '../x' } });
  assert.deepEqual([badRepo.observed.causes.releaseExists.code, badRepo.observed.causes.releaseExists.detail], ['input-invalid', 'GITHUB_REPOSITORY']);
});

// Correction 8: whether the version is (or, once published, will be) the newest npm has.
test('latest: yes for the newest version, no for an older one, yes for a version about to be published', async () => {
  assert.equal((await run()).observed.context.latest, 'yes');
  const doc = (...versions) => json({ name: 'footprint-storydeck', versions: Object.fromEntries(versions.map((version) => [version, { version }])) });
  const newer = { ...npmRoutes, 'https://registry.npmjs.org/footprint-storydeck': doc('0.13.1', '0.14.0') };
  assert.equal((await run({ routes: newer })).observed.context.latest, 'no');
  const files = bumped('0.13.2', '\n## 0.13.2 \u2014 a test\n\n- x\n');
  assert.equal((await run({ files, lsRemote: '' })).observed.context.latest, 'yes');
  // A plain version is newer than its own prereleases, older than the next one's.
  assert.equal((await run({ routes: { ...npmRoutes, 'https://registry.npmjs.org/footprint-storydeck': doc('0.13.1', '0.13.1-rc.0') } })).observed.context.latest, 'yes');
  assert.equal((await run({ routes: { ...npmRoutes, 'https://registry.npmjs.org/footprint-storydeck': doc('0.13.1', '0.13.2-rc.0') } })).observed.context.latest, 'no');
});

// Correction 5, through observe: the caller's workflow files at the planned commit.
test('pinsAgree: every route line pins the commit running; the first that does not is kept, cleaned, for the refusal', async () => {
  const at = (pin) => `    uses: footprintjs/ci/.github/workflows/release-route.yml@${pin} # the reviewed ci commit\n`;
  const withFiles = (extra) => ({ ...today, ...Object.fromEntries(Object.entries(extra).map(([name, text]) => [`.github/workflows/${name}`, Buffer.from(text)])) });
  const agree = await run({ files: withFiles({ 'publish.yml': at(TOOL), 'ci.yaml': `  release-check:\n    uses: footprintjs/ci/.github/workflows/release-check.yml@${TOOL}\n` }) });
  assert.equal(agree.observed.facts.pinsAgree, true);
  const differ = await run({ files: withFiles({ 'publish.yml': at(TOOL), 'pr.yml': at('main') }) });
  assert.deepEqual([differ.observed.facts.pinsAgree, differ.observed.context.pinsDiffer, differ.result.rule], [false, 'pr.yml pins main', 'pins-differ']);
  // Not asked for a tool commit that is not plain (tool-commit-invalid names that first).
  const notPlain = await run({ files: withFiles({ 'pr.yml': at('main') }), extra: { ROUTE_TOOL_SHA: 'main' } });
  assert.deepEqual([notPlain.observed.facts.pinsAgree, notPlain.result.rule], [undefined, 'tool-commit-invalid']);
  // No route pin at all (a commit whose workflow files name no route) and a pin spelled another way
  // are unreadable, never agreement.
  const { '.github/workflows/publish.yml': _p, '.github/workflows/release-check.yml': _c, ...noWorkflows } = today;
  const none = await run({ files: noWorkflows });
  assert.deepEqual([none.observed.facts.pinsAgree, none.observed.causes.pinsAgree.detail, none.result.rule],
    [null, 'no route pin in .github/workflows', 'facts-unreadable']);
  const flow = await run({ files: withFiles({ 'odd.yml': `jobs:\n  release: { uses: footprintjs/ci/.github/workflows/release-route.yml@main }\n` }) });
  assert.deepEqual([flow.observed.facts.pinsAgree, flow.observed.causes.pinsAgree.detail], [null, 'odd.yml: a route pin not on a plain uses line']);
  // A symlinked workflow file is unreadable, never followed.
  const linked = recordedGit({ commit: COMMIT, files: withFiles({ 'publish.yml': at(TOOL) }), modes: { '.github/workflows/publish.yml': '120000 blob' } });
  const observed = await observe({ env: env(), git: linked.git, fetcher: fakeFetch(npmRoutes).fetcher });
  assert.deepEqual([observed.facts.pinsAgree, observed.causes.pinsAgree.code], [null, 'workflows-unreadable']);
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
  // The reader's case: npm has the version, its tag was never written, and main moved on. That
  // is unfinished work, red on purpose, not an old run.
  const unfinished = await run({ lsRemote: '', mainTip: 'f'.repeat(40) });
  assert.deepEqual([unfinished.result.rule, unfinished.result.refuse], ['unfinished-not-tip', 'release-unfinished']);
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
