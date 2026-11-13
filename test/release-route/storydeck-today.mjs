// The family as it is today, as doors: storydeck main a3936e3 (recorded git), npm's and GitHub's
// saved answers (the GitHub release of v0.13.1 read 2026-11-13, trimmed to four fields), and the
// .github/release.json storydeck's first pull request will add. The same
// fixtures observe.test.mjs reads; this module hands them out as doors any test can vary.
import { readFileSync } from 'node:fs';
import { fakeFetch, json } from './fake-fetch.mjs';
import { recordedGit } from './recorded-git.mjs';

export const fixture = (path) => readFileSync(new URL(`fixtures/${path}`, import.meta.url));
export const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
export const TOOL = '1df988109047e3143c71bf459f3e10c968376e13';
// storydeck's two real caller files (main d7eef62, fixtures/storydeck-workflows/), their route pin
// set to the tool commit these doors run as, so `pinsAgree` reads true as on a real run of the route.
const STORYDECK_PIN = '67dc3738bfba1e8cdf960b0301450db6ff410692';
export const callerFile = (name, pin = TOOL) => Buffer.from(fixture(`storydeck-workflows/${name}`).toString().replace(STORYDECK_PIN, pin));
export const WORKFLOWS = Object.freeze({
  '.github/workflows/publish.yml': callerFile('publish.yml'),
  '.github/workflows/release-check.yml': callerFile('release-check.yml'),
});
export const FILES = Object.freeze({
  'package.json': fixture('storydeck-today/package.json'),
  'CHANGELOG.md': fixture('storydeck-today/CHANGELOG.md'),
  '.github/release.json': fixture('family/storydeck.release.json'),
  ...WORKFLOWS,
});
export const ROUTES = Object.freeze({
  'https://registry.npmjs.org/footprint-storydeck': json(fixture('npm/footprint-storydeck.abbrev.json').toString()),
  [`https://api.github.com/repos/footprintjs/ci/compare/main...${TOOL}?per_page=1`]: json(fixture('github/compare-behind.json').toString()),
  'https://api.github.com/repos/footprintjs/storydeck/releases/tags/v0.13.1': json(fixture('github/release-storydeck-v0.13.1.json').toString()),
});
const TIP = fixture('storydeck-today/ls-remote-main.txt').toString().split('\t')[0];
const TAGS = fixture('storydeck-today/ls-remote.txt').toString();

export function storydeckDoors({ files = FILES, lsRemote = TAGS, routes = ROUTES, extra = {}, mainTip = TIP } = {}) {
  const { fetcher, calls } = fakeFetch(routes);
  return {
    env: { GITHUB_SHA: COMMIT, GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish', ROUTE_TOOL_SHA: TOOL, GITHUB_REPOSITORY: 'footprintjs/storydeck', ...extra },
    git: recordedGit({ commit: COMMIT, files, lsRemote, mainTip }).git,
    fetcher,
    calls,
  };
}
