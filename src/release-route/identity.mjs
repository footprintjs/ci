// The shapes of the route's identifiers, owned once: a commit, a plain version, an npm package
// name, and "newer than every published version". Anything that fails these shapes is refused
// before it reaches git, a URL or a later job.

export const COMMIT = /^[a-f0-9]{40}$/;
// Plain x.y.z, no leading zeros, no prerelease or build part. Prereleases are a later phase.
export const PLAIN_VERSION = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
// npm's rule for new names: lowercase, URL-safe, optional @scope/, at most 214 characters.
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
// Any semver npm may hold: x.y.z with an optional prerelease and build part.
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export const isCommit = (value) => typeof value === 'string' && COMMIT.test(value) && !/^0+$/.test(value);
export const isPlainVersion = (value) => typeof value === 'string' && PLAIN_VERSION.test(value);
export const isPackageName = (value) => typeof value === 'string' && value.length <= 214 && NAME.test(value);

// The core numbers of any published version, and whether it is a prerelease. null when the text
// is not semver at all (the caller treats that as "could not read", never as "older").
function parse(version) {
  const match = typeof version === 'string' && version.length <= 256 ? SEMVER.exec(version) : null;
  if (!match) return null;
  const core = match.slice(1, 4).map(Number);
  if (!core.every(Number.isSafeInteger)) return null;
  return { core, pre: match[4] !== undefined };
}

// true when the plain `version` is newer than every one of `published`; null when any published
// version cannot be read. A plain x.y.z is newer than its own prereleases (1.0.0 > 1.0.0-rc.1),
// so comparing the core numbers and then "plain beats prerelease" is the whole of semver
// precedence this question needs.
export function newerThanAll(version, published) {
  const mine = isPlainVersion(version) ? parse(version) : null;
  if (!mine || !Array.isArray(published)) return null;
  for (const other of published) {
    const theirs = parse(other);
    if (!theirs) return null;
    const order = mine.core.map((n, i) => Math.sign(n - theirs.core[i])).find((sign) => sign !== 0) ?? 0;
    if (order < 0 || (order === 0 && !theirs.pre)) return false;
  }
  return true;
}
