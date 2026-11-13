// Gather the facts `plan` needs, through injected doors: `git` (repo.mjs), `fetcher` (npm and
// GitHub) and `env`. No decision here: a fact that cannot be read is null, and the refusal that
// stopped it is kept in `causes` so the plan step can print WHY it is unknown.
//
// One OBSERVER per thing the route looks at (the request, the tip of main, the tool commit, the
// caller's pins of the route, the settings, the package, the tag, the GitHub release, npm, the
// changelog). Each returns { facts, causes, context } and
// is the one reader of its facts: `observe` runs them in order for the plain step, and the
// charted step (chart/) runs the same observers as stages, side by side where they do not depend
// on each other. Some facts are not asked when an earlier fact makes them meaningless (no tag
// lookup for a version that is not plain, no versions for a package npm does not know). They stay
// null, and the rule table names the earlier reason first (see rules.mjs).
import strictJson from './archive/strict-json.cjs';
import { decodeChangelog, findSection, MAX_CHANGELOG_BYTES } from './changelog.mjs';
import { readRelease, toolReviewed } from './github.mjs';
import { isCommit, isPackageName, isPlainVersion, newerThanAll } from './identity.mjs';
import { workflowPins } from './pins.mjs';
import { readVersions } from './registry.mjs';
import { mainTip, readAtCommit, tagCommit } from './repo.mjs';
import { asRefusal, Refusal, refuse } from './refusals.mjs';
import { FACTS } from './rules.mjs';
import { readSettings, MAX_SETTINGS_BYTES, SETTINGS_PATH } from './settings.mjs';
import { decideRelease } from './tag.mjs';

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

// Every plain `uses:` line of the caller's workflow files that names release-route.yml or
// release-check.yml pins the commit running (pins.mjs: a mention written any other way, or no
// route pin at all, is unreadable). Asked only for a plain tool commit (tool-commit-invalid names
// the reason otherwise). When a pin differs, the file and the pin, cleaned, are kept as
// `pinsDiffer` for the refusal's detail.
export async function observePins({ env, git, commit }) {
  const { found, read } = observation();
  if (isCommit(env.ROUTE_TOOL_SHA))
    await read('pinsAgree', () => {
      const pins = workflowPins(git, commit, env.ROUTE_TOOL_SHA);
      if (!pins.agree) found.context.pinsDiffer = `${pins.file} pins ${pins.pin}`;
      return pins.agree;
    });
  return found;
}

export async function observeSettings({ git, commit }) {
  const { found, read } = observation();
  await read('settingsRead', () => {
    const bytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
    if (bytes === null) refuse('settings-unreadable', SETTINGS_PATH);
    const settings = readSettings(bytes);
    found.context.changelogStyle = settings.changelog;
    // The Node major the build job must run: handed on as the plan's `node` output (step-common.mjs).
    found.context.node = settings.node;
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

// Does origin have tag v<version> (tagExists), and does it name the planned commit (tagAtCommit)?
// One question (`ls-remote`, the tag peeled): when there is no tag, tagAtCommit is false and nothing
// more is asked; when the tag could not be read, both are unknown with the same cause.
export async function observeTag({ git, version, commit }) {
  const { found, read } = observation();
  if (!version) return found;
  let tagAt = null;
  await read('tagExists', () => {
    tagAt = tagCommit(git, version);
    return tagAt !== null;
  });
  if (found.facts.tagExists === null) {
    found.facts.tagAtCommit = null;
    found.causes.tagAtCommit = found.causes.tagExists;
  } else found.facts.tagAtCommit = tagAt === commit;
  return found;
}

// Is there a PUBLISHED GitHub release for tag v<version> (releaseExists)? Asked, with the job's
// token from the fixed host (github.mjs · readRelease), only when the tag exists; with no tag it is
// false and nothing is asked. The answer is read by the release job's own rule (tag.mjs ·
// decideRelease): a release for exactly this tag is true, none is false, and a release naming
// another tag is the refusal release-unexpected (the fact unknown, the cause printed). A draft is
// NOT seen: the endpoint asked, GET /repos/{repo}/releases/tags/{tag}, answers only a published
// release, so a draft reads as no release, and finish (like publish and recover) then writes a
// published release beside it (docs/RELEASE-ROUTE.md, "What tag cannot see: a draft release").
export async function observeRelease({ env, fetcher, version, tagExists }) {
  const { found, read } = observation();
  if (!version || (tagExists !== true && tagExists !== false)) return found;
  if (tagExists === false) {
    found.facts.releaseExists = false;
    return found;
  }
  await read('releaseExists', async () => decideRelease({
    release: await readRelease({ fetcher, repo: env.GITHUB_REPOSITORY, version, token: env.GITHUB_TOKEN }), version }) === 'skip');
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
    // Is this version the newest npm has, or will have once it is published? The release job marks
    // the GitHub release "Latest" only then (`latest`: yes or no), so a recover or a finish of an
    // older version never takes "Latest" from a newer one. Not a fact: no rule decides on it.
    const newest = newerThanAll(version, versions.filter((other) => other !== version));
    if (newest !== null) found.context.latest = newest ? 'yes' : 'no';
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
  const pins = await observePins({ env, git, commit });
  const { name, version } = pkg.context;
  const tag = await observeTag({ git, version, commit });
  const release = await observeRelease({ env, fetcher, version, tagExists: tag.facts.tagExists });
  const npm = await observeNpm({ fetcher, name, version });
  const changelog = await observeChangelog({ git, commit, changelogStyle: settings.context.changelogStyle, version });
  return merge(request, tip, tool, settings, pkg, pins, tag, release, npm, changelog);
}
