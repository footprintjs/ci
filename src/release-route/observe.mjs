// Gather the facts `plan` needs, through injected doors: `git` (repo.mjs), `fetcher` (npm and
// GitHub) and `env`. No decision here: a fact that cannot be read is null, and the refusal that
// stopped it is kept in `causes` so the plan step can print WHY it is unknown.
//
// One OBSERVER per thing the route looks at (the request, the tip of main, the tool commit, the
// settings, the package, the tag, npm, the changelog). Each returns { facts, causes, context } and
// is the one reader of its facts: `observe` runs them in order for the plain step, and the
// charted step (chart/) runs the same observers as stages, side by side where they do not depend
// on each other. Some facts are not asked when an earlier fact makes them meaningless (no tag
// lookup for a version that is not plain, no versions for a package npm does not know). They stay
// null, and the rule table names the earlier reason first (see rules.mjs).
import strictJson from './archive/strict-json.cjs';
import { decodeChangelog, findSection, MAX_CHANGELOG_BYTES } from './changelog.mjs';
import { toolReviewed } from './github.mjs';
import { isCommit, isPackageName, isPlainVersion, newerThanAll } from './identity.mjs';
import { readVersions } from './registry.mjs';
import { mainTip, readAtCommit, tagExists } from './repo.mjs';
import { asRefusal, Refusal, refuse } from './refusals.mjs';
import { FACTS } from './rules.mjs';
import { readSettings, MAX_SETTINGS_BYTES, SETTINGS_PATH } from './settings.mjs';

const MAX_PACKAGE_BYTES = 1024 * 1024;

// The package.json of the commit, strictly read; refusals renamed to the package's own codes.
export function readPackage(git, commit) {
  const bytes = readAtCommit(git, commit, 'package.json', MAX_PACKAGE_BYTES, 'package-unreadable');
  if (bytes === null) refuse('package-unreadable', 'package.json');
  try {
    return { bytes, manifest: strictJson.parseManifest(bytes) };
  } catch {
    refuse('package-json');
  }
}

// One observation's facts, causes and context. `read` runs one reader: an exception leaves the
// fact null and records its refusal.
function observation() {
  const found = { facts: {}, causes: {}, context: {} };
  const read = async (name, reader) => {
    try {
      found.facts[name] = await reader();
    } catch (error) {
      found.facts[name] = null;
      found.causes[name] = asRefusal(error);
    }
  };
  return { found, read };
}

// The request the workflow made. A malformed GITHUB_SHA stops everything (input-invalid): every
// other fact is read at that commit.
// The action is text from outside (the workflow's input). It is a fact only when it is EXACTLY one
// of the values rules.mjs allows; anything else ("publish " with a space, a hidden character) is
// unreadable, with its cause, never a cleaned look-alike. Both the plain step and the chart decide
// on what this returns.
export function observeRequest(env) {
  const commit = env.GITHUB_SHA;
  if (!isCommit(commit)) refuse('input-invalid', 'GITHUB_SHA');
  const action = FACTS.action.includes(env.ROUTE_ACTION) ? env.ROUTE_ACTION : null;
  return {
    facts: {
      action,
      refIsMain: typeof env.GITHUB_REF === 'string' && env.GITHUB_REF !== '' ? env.GITHUB_REF === 'refs/heads/main' : null,
      toolCommitPlain: isCommit(env.ROUTE_TOOL_SHA),
    },
    causes: action === null ? { action: new Refusal('input-invalid', 'ROUTE_ACTION') } : {},
    context: { commit },
  };
}

export async function observeTip({ git, commit }) {
  const { found, read } = observation();
  await read('commitIsMainTip', () => mainTip(git) === commit);
  return found;
}

// The token, when there is one, stays in this call: it never becomes a fact or a context value.
export async function observeTool({ env, fetcher }) {
  const { found, read } = observation();
  if (isCommit(env.ROUTE_TOOL_SHA))
    await read('toolReviewed', () => toolReviewed({ fetcher, sha: env.ROUTE_TOOL_SHA, token: env.GITHUB_TOKEN }));
  return found;
}

export async function observeSettings({ git, commit }) {
  const { found, read } = observation();
  await read('settingsRead', () => {
    const bytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
    if (bytes === null) refuse('settings-unreadable', SETTINGS_PATH);
    found.context.changelogStyle = readSettings(bytes).changelog;
    return true;
  });
  return found;
}

export async function observePackage({ git, commit }) {
  const { found, read } = observation();
  let manifest = null;
  await read('packageNamed', () => {
    manifest = readPackage(git, commit).manifest;
    if (!Object.hasOwn(manifest, 'name')) return false;
    if (!isPackageName(manifest.name)) refuse('package-name-invalid');
    found.context.name = manifest.name;
    return true;
  });
  if (manifest) {
    await read('packagePrivate', () => {
      if (!Object.hasOwn(manifest, 'private')) return false;
      if (typeof manifest.private !== 'boolean') refuse('package-json', 'private');
      return manifest.private;
    });
    found.facts.versionPlain = isPlainVersion(manifest.version);
    if (found.facts.versionPlain) found.context.version = manifest.version;
  }
  return found;
}

export async function observeTag({ git, version }) {
  const { found, read } = observation();
  if (version) await read('tagExists', () => tagExists(git, version));
  return found;
}

export async function observeNpm({ fetcher, name, version }) {
  const { found, read } = observation();
  if (!name) return found;
  let versions = null;
  await read('packageKnown', async () => {
    const answer = await readVersions({ fetcher, name });
    versions = answer.versions;
    return answer.known;
  });
  if (found.facts.packageKnown === true && version) {
    found.facts.npmHasVersion = versions.includes(version);
    await read('versionNewer', () => newerThanAll(version, versions) ?? refuse('response-shape', 'a version npm lists is not semver'));
  }
  return found;
}

export async function observeChangelog({ git, commit, changelogStyle, version }) {
  const { found, read } = observation();
  if (changelogStyle && version)
    await read('changelogFound', () => {
      const bytes = readAtCommit(git, commit, 'CHANGELOG.md', MAX_CHANGELOG_BYTES, 'changelog-unreadable');
      return bytes !== null && findSection(decodeChangelog(bytes), version, changelogStyle) !== null;
    });
  return found;
}

// Merge observations into one { facts, causes, context }.
export function merge(...found) {
  return {
    facts: Object.assign({}, ...found.map((one) => one.facts)),
    causes: Object.assign({}, ...found.map((one) => one.causes)),
    context: Object.assign({}, ...found.map((one) => one.context)),
  };
}

// The plain step: every observer in order.
export async function observe({ env, git, fetcher }) {
  const request = observeRequest(env);
  const { commit } = request.context;
  const tip = await observeTip({ git, commit });
  const tool = await observeTool({ env, fetcher });
  const settings = await observeSettings({ git, commit });
  const pkg = await observePackage({ git, commit });
  const { name, version } = pkg.context;
  const tag = await observeTag({ git, version });
  const npm = await observeNpm({ fetcher, name, version });
  const changelog = await observeChangelog({ git, commit, changelogStyle: settings.context.changelogStyle, version });
  return merge(request, tip, tool, settings, pkg, tag, npm, changelog);
}
