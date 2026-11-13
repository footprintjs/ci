// The charted plan against the plain one (the oracle) on every input the second reader tried and
// two more: the exit code, every printed line, GITHUB_OUTPUT and the job summary must be equal;
// the only lines the chart may add are its Story: and Record: lines.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FILES, ROUTES, TOOL, storydeckDoors } from '../storydeck-today.mjs';
import { runBoth } from './same-steps.mjs';

const answer = (body, status = 200, headers) => () => new Response(body, { status, headers });
const NPM = 'https://registry.npmjs.org/footprint-storydeck';
const GH = `https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`;
const pkg = JSON.parse(FILES['package.json']);
const withPkg = (change) => ({ ...FILES, 'package.json': Buffer.from(JSON.stringify({ ...pkg, ...change }, null, 2)) });
const bump = (version, section = true) => ({ ...withPkg({ version }), 'CHANGELOG.md': section
  ? Buffer.from(FILES['CHANGELOG.md'].toString().replace('# Changelog\n', `# Changelog\n\n## ${version} \u{2014} t\n\n- x\n`)) : FILES['CHANGELOG.md'] });
const without = (name) => Object.fromEntries(Object.entries(FILES).filter(([path]) => path !== name));
const unnamed = (() => { const { name, ...rest } = pkg; return { ...FILES, 'package.json': Buffer.from(JSON.stringify(rest)) }; })();
const next = { files: bump('0.13.2'), lsRemote: '' };
const RELEASE = (version) => `https://api.github.com/repos/footprintjs/storydeck/releases/tags/v${version}`;
const TAGGED_HERE = `${'a3936e304d8670f7fcec40d227df1309a994d46c'}\trefs/tags/v0.13.1\n`;
const NO_RELEASE = { ...ROUTES, [RELEASE('0.13.1')]: answer('{"message":"Not Found"}', 404) };
const pinned = (pin) => ({ ...FILES, '.github/workflows/publish.yml': Buffer.from(`    uses: footprintjs/ci/.github/workflows/release-route.yml@${pin}\n`) });

const PLAN_CASES = [
  ['today: released', {}, 'released'],
  ['dry run from a branch', { extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/x' } }, 'dry-run-not-released-commit'],
  ['dry run at the tagged commit', { lsRemote: TAGGED_HERE, extra: { ROUTE_ACTION: 'dry-run', GITHUB_REF: 'refs/heads/x' } }, 'dry-run-released'],
  ['finish: tagged here, on npm, no GitHub release', { lsRemote: TAGGED_HERE, routes: NO_RELEASE }, 'finish'],
  ['no GitHub release, the tag at an older commit', { routes: NO_RELEASE }, 'finish-tag-elsewhere'],
  ['no GitHub release, off main', { lsRemote: TAGGED_HERE, routes: NO_RELEASE, extra: { GITHUB_REF: 'refs/heads/x' } }, 'finish-off-main'],
  ['no GitHub release, not the tip', { lsRemote: TAGGED_HERE, routes: NO_RELEASE, mainTip: 'f'.repeat(40) }, 'finish-not-tip'],
  ['GitHub releases 502', { routes: { ...ROUTES, [RELEASE('0.13.1')]: answer('{}', 502) } }, 'facts-unreadable'],
  ['a workflow pins the route elsewhere', { files: pinned('main') }, 'pins-differ'],
  ['a workflow pins the route here', { files: pinned(TOOL) }, 'released'],
  ['0.13.2 publish', next, 'publish'],
  ['0.13.2 dry run', { ...next, extra: { ROUTE_ACTION: 'dry-run' } }, 'dry-run-would-publish'],
  ['0.13.2 off main', { ...next, extra: { GITHUB_REF: 'refs/heads/x' } }, 'publish-off-main'],
  ['0.13.2 without its section', { files: bump('0.13.2', false), lsRemote: '' }, 'changelog-missing'],
  ['0.13.2 not the tip', { ...next, mainTip: 'f'.repeat(40) }, 'not-main-tip'],
  ['0.13.0, on npm, no tag', { files: bump('0.13.0'), lsRemote: '' }, 'facts-unreadable'],
  ['0.12.9, not on npm, older', { files: bump('0.12.9'), lsRemote: '' }, 'version-not-newer'],
  ['recover', { lsRemote: '' }, 'recover'],
  ['recover as a dry run', { lsRemote: '', extra: { ROUTE_ACTION: 'dry-run' } }, 'dry-run-recover'],
  ['recover off main', { lsRemote: '', extra: { GITHUB_REF: 'refs/heads/x' } }, 'recover-off-main'],
  ['unfinished, not the tip', { lsRemote: '', mainTip: 'f'.repeat(40) }, 'unfinished-not-tip'],
  ['a tag without the package', { files: bump('0.13.2'), lsRemote: `${'a'.repeat(40)}\trefs/tags/v0.13.2\n`,
    routes: { ...ROUTES, [RELEASE('0.13.2')]: answer('{"message":"Not Found"}', 404) } }, 'tag-without-package'],
  ['private', { files: withPkg({ private: true }) }, 'package-private'],
  ['no name', { files: unnamed }, 'package-unnamed'],
  ['a bad name', { files: withPkg({ name: 'Bad Name' }) }, 'facts-unreadable'],
  ['a prerelease', { files: withPkg({ version: '0.14.0-rc.1' }) }, 'version-not-plain'],
  ['npm: unknown package', { routes: { ...ROUTES, [NPM]: answer('{}', 404) } }, 'package-unknown'],
  ['npm 503', { routes: { ...ROUTES, [NPM]: answer('{}', 503) } }, 'facts-unreadable'],
  ['npm redirect', { routes: { ...ROUTES, [NPM]: answer(null, 302, { location: 'https://x/' }) } }, 'facts-unreadable'],
  ['npm not JSON', { routes: { ...ROUTES, [NPM]: answer('nope') } }, 'facts-unreadable'],
  ['GitHub 403', { routes: { ...ROUTES, [GH]: answer('{}', 403) } }, 'facts-unreadable'],
  ['tool commit diverged', { routes: { ...ROUTES, [GH]: answer(JSON.stringify({ status: 'diverged', merge_base_commit: { sha: TOOL } })) } }, 'tool-not-reviewed'],
  ['tool commit not plain', { extra: { ROUTE_TOOL_SHA: 'xyz' } }, 'tool-commit-invalid'],
  ['GITHUB_SHA not a commit', { extra: { GITHUB_SHA: 'main' } }, undefined],
  ['GITHUB_REF empty', { extra: { GITHUB_REF: '' } }, 'facts-unreadable'],
  ['ROUTE_ACTION absent', { extra: { ROUTE_ACTION: undefined } }, 'facts-unreadable'],
  ['ROUTE_ACTION "prepare"', { extra: { ROUTE_ACTION: 'prepare' } }, 'facts-unreadable'],
  ['no settings file', { files: without('.github/release.json') }, 'facts-unreadable'],
  ['settings with a duplicate key', { files: { ...FILES, '.github/release.json': Buffer.from('{"schema":1,"schema":1}') } }, 'facts-unreadable'],
  ['a changelog section twice', { files: { ...FILES, 'CHANGELOG.md': Buffer.from(`${FILES['CHANGELOG.md']}\n## 0.13.1\n`) } }, 'facts-unreadable'],
  ['git ls-remote fails', { lsRemote: null }, 'facts-unreadable'],
  // The second reader's four: outside text the plain step refuses must not be cleaned into a value.
  ['ROUTE_ACTION "publish " (a trailing space)', { ...next, extra: { ROUTE_ACTION: 'publish ' } }, 'facts-unreadable'],
  ['ROUTE_ACTION "publish" + a zero-width space', { ...next, extra: { ROUTE_ACTION: 'publish\u{200B}' } }, 'facts-unreadable'],
  ['ROUTE_ACTION "\\tpublish\\n"', { ...next, extra: { ROUTE_ACTION: '\tpublish\n' } }, 'facts-unreadable'],
  ['ROUTE_ACTION "dry-run" + a direction mark', { extra: { ROUTE_ACTION: 'dry-run\u{202E}' } }, 'facts-unreadable'],
  ['ROUTE_ACTION of 63 characters', { extra: { ROUTE_ACTION: 'publish'.repeat(9) } }, 'facts-unreadable'],
];

const doorsFor = (options) => () => {
  const doors = storydeckDoors(options);
  if (options.lsRemote === null) {
    const git = doors.git;
    doors.git = (args) => { if (args[0] === 'ls-remote') throw new Error('ls-remote failed'); return git(args); };
  }
  if (options.extra && Object.hasOwn(options.extra, 'ROUTE_ACTION') && options.extra.ROUTE_ACTION === undefined) delete doors.env.ROUTE_ACTION;
  return doors;
};

for (const [label, options, rule] of PLAN_CASES)
  test(`plan, plain and charted, leave the same lines, outputs, summary and exit code: ${label}`, async () => {
    const { plain, chart } = await runBoth('plan', doorsFor(options));
    assert.equal(/rule=([a-z-]+)/.exec(plain.output)?.[1], rule, 'the oracle reaches the rule this input is for');
    assert.deepEqual(chart, { ...plain, chartOnly: chart.chartOnly });
    assert.ok(chart.chartOnly.every((line) => /^(Story: \[Condition\]|Record: )/.test(line)), chart.chartOnly.join('\n'));
  });
