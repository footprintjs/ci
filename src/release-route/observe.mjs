// Gather the facts `plan` needs, through injected doors: `git` (repo.mjs), `fetcher` (npm and
// GitHub) and `env`. No decision here: a fact that cannot be read is null, and the refusal that
// stopped it is kept in `causes` so the plan step can print WHY it is unknown.
//
// Some facts are not asked when an earlier fact makes them meaningless (no tag lookup for a
// version that is not plain, no versions for a package npm does not know). They stay null, and
// the rule table names the earlier reason first (see rules.mjs).
import strictJson from './archive/strict-json.cjs';
import { decodeChangelog, findSection, MAX_CHANGELOG_BYTES } from './changelog.mjs';
import { toolReviewed } from './github.mjs';
import { isCommit, isPackageName, isPlainVersion, newerThanAll } from './identity.mjs';
import { readVersions } from './registry.mjs';
import { readAtCommit, tagExists } from './repo.mjs';
import { asRefusal, refuse } from './refusals.mjs';
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

export async function observe({ env, git, fetcher }) {
  const commit = env.GITHUB_SHA;
  if (!isCommit(commit)) refuse('input-invalid', 'GITHUB_SHA');
  const facts = {};
  const causes = {};
  // Runs one reader; an exception leaves the fact null and records its refusal.
  const read = async (name, reader) => {
    try {
      facts[name] = await reader();
    } catch (error) {
      facts[name] = null;
      causes[name] = asRefusal(error);
    }
  };
  const context = { commit };

  facts.action = env.ROUTE_ACTION ?? null;
  facts.refIsMain = typeof env.GITHUB_REF === 'string' && env.GITHUB_REF !== '' ? env.GITHUB_REF === 'refs/heads/main' : null;
  facts.toolCommitPlain = isCommit(env.ROUTE_TOOL_SHA);
  if (facts.toolCommitPlain)
    await read('toolReviewed', () => toolReviewed({ fetcher, sha: env.ROUTE_TOOL_SHA, token: env.GITHUB_TOKEN, apiUrl: env.GITHUB_API_URL }));

  let settings = null;
  await read('settingsRead', () => {
    const bytes = readAtCommit(git, commit, SETTINGS_PATH, MAX_SETTINGS_BYTES, 'settings-unreadable');
    if (bytes === null) refuse('settings-unreadable', SETTINGS_PATH);
    settings = readSettings(bytes);
    return true;
  });

  let manifest = null;
  await read('packageNamed', () => {
    manifest = readPackage(git, commit).manifest;
    if (!Object.hasOwn(manifest, 'name')) return false;
    if (!isPackageName(manifest.name)) refuse('package-name-invalid');
    context.name = manifest.name;
    return true;
  });
  if (manifest) {
    await read('packagePrivate', () => {
      if (!Object.hasOwn(manifest, 'private')) return false;
      if (typeof manifest.private !== 'boolean') refuse('package-json', 'private');
      return manifest.private;
    });
    facts.versionPlain = isPlainVersion(manifest.version);
    if (facts.versionPlain) context.version = manifest.version;
  }

  if (context.version) await read('tagExists', () => tagExists(git, context.version));

  if (context.name) {
    let versions = null;
    await read('packageKnown', async () => {
      const answer = await readVersions({ fetcher, name: context.name });
      versions = answer.versions;
      return answer.known;
    });
    if (facts.packageKnown === true && context.version) {
      facts.npmHasVersion = versions.includes(context.version);
      await read('versionNewer', () => newerThanAll(context.version, versions) ?? refuse('response-shape', 'a version npm lists is not semver'));
    }
  }

  if (settings && context.version)
    await read('changelogFound', () => {
      const bytes = readAtCommit(git, commit, 'CHANGELOG.md', MAX_CHANGELOG_BYTES, 'changelog-unreadable');
      return bytes !== null && findSection(decodeChangelog(bytes), context.version, settings.changelog) !== null;
    });

  return { facts, causes, context, settings };
}
