// THE table of refusals. Every stop anywhere in the release route is one of these codes, and
// what a person reads is the sentence here plus a short detail. A stop with a code that is not
// in the table is itself a stop (`unknown-refusal`), and an exception the route has no name for
// is `unexpected-failure`: nothing turns a failure into a pass.
//
// Why one table: a release that stops with "failed" teaches people to re-run until it is green.
// A code with a sentence says what to fix, and a test can pin each one (test/release-route/refusals.test.mjs).
import archiveRefusal from './archive/refusal.cjs';

export const REFUSALS = Object.freeze({
  // The command itself.
  'unknown-step': 'The step is not one of plan, build, inspect, verify, notes.',
  'input-invalid': 'An input the workflow passes is missing or malformed.',
  'output-invalid': 'A value meant for a later job is outside its closed alphabet, so it is not written.',
  'unexpected-failure': 'Something failed that the route has no name for; it stops rather than guess.',
  'unknown-refusal': 'The route tried to stop with a reason it does not know; that is a stop as well.',

  // The settings file, .github/release.json.
  'settings-unreadable': '.github/release.json is missing, not a regular file, or larger than its bound.',
  'settings-json': '.github/release.json is not strict JSON (malformed, a duplicate key, or over a bound).',
  'settings-unknown-key': '.github/release.json has a key the route does not know.',
  'settings-missing-key': '.github/release.json lacks a key every package must set.',
  'settings-invalid': 'A setting in .github/release.json has the wrong type or is out of bounds.',
  'archive-setting': 'The archive setting has a malformed, duplicate or always-allowed entry.',

  // package.json and CHANGELOG.md at the commit being released.
  'package-unreadable': 'package.json is missing, not a regular file, or larger than its bound.',
  'package-json': 'package.json is not strict JSON (malformed, a duplicate key, or over a bound).',
  'not-publishable': 'package.json says "private": true or has no name, so nothing is published.',
  'package-name-invalid': 'The package name in package.json is not a valid npm name.',
  'version-not-plain': 'The version is not plain x.y.z; prereleases are not released by this route yet.',
  'changelog-unreadable': 'CHANGELOG.md is not a regular file, not UTF-8 text, or larger than its bound.',
  'changelog-missing': 'CHANGELOG.md has no section for this version.',
  'changelog-duplicate': 'CHANGELOG.md has more than one section for this version.',

  // Git and the checkout.
  'git-failed': 'A git question failed, so the route could not see the repository.',
  'checkout-mismatch': 'The checkout is not the planned commit with a clean tree.',

  // The network: npm and GitHub answers.
  'request-failed': 'A request could not be made or did not finish in time.',
  'response-status': 'The server answered with a status the route does not accept.',
  'response-redirect': 'The server answered with a redirect; the route never follows one.',
  'response-too-large': 'The answer is larger than its bound.',
  'response-not-json': 'The answer is not strict JSON (malformed, a duplicate key, or over a bound).',
  'response-shape': 'The answer is JSON, but not the shape that was asked for.',
  'tarball-url': 'npm names a tarball address that is not the expected one on registry.npmjs.org.',

  // The decision (src/release-route/rules.mjs).
  'fact-unreadable': 'A fact the decision needs could not be read, so the route does not guess.',
  'tool-commit-invalid': 'The release tool commit is not 40 lowercase hex characters.',
  'tool-not-reviewed': 'The release tool commit is not on footprintjs/ci main, so it was never reviewed there.',
  'package-unknown': 'npm does not know this package; the first publish of a new name is done by hand.',
  'tag-without-package': 'The tag for this version exists but npm does not have the version; decide by hand.',
  'version-not-newer': 'The version is not newer than every version npm already has.',
  'publish-off-main': 'A real publish runs only from main.',
  'recover-off-main': 'Recovering a release writes a tag and a GitHub release, so it runs only from main.',
  'no-rule-matched': 'No rule of the decision matched these facts, so nothing is decided.',

  // Building the package.
  'output-folder': 'The output folder is not an empty folder the route may write.',
  'node-version': 'The Node running the build is not the major version the settings name.',
  'system-packages-failed': 'Installing the system packages failed.',
  'install-failed': 'The install command failed.',
  'check-failed': 'A check failed.',
  'pack-failed': 'npm pack failed.',
  'pack-output': 'npm pack did not leave exactly one regular .tgz file.',

  // npm against the built file.
  'registry-differs': 'npm serves different bytes for this version than the file the route built.',
  'registry-late': 'npm did not show this version within the bounded wait.',

  // The archive inspector (src/release-route/archive/); codes may carry ":<field>".
  'invalid-archive': 'The tarball is not the closed gzip/tar shape the route accepts.',
  'archive-profile': 'The tarball uses a tar extension (long or non-ASCII path, PAX, GNU) the route refuses.',
  'manifest-json': 'A package.json is not strict JSON (malformed, a duplicate key, or over a bound).',
  'manifest-source': 'The packed package.json differs from the source package.json in a field other than version.',
  'archive-path': 'The tarball holds a file the archive setting does not allow.',
  'archive-denied': 'The tarball holds a file no setting may allow (root binding.gyp, server.js or npm-shrinkwrap.json; any .npmrc or node_modules).',
  'archive-missing': 'A folder or file the archive setting requires is not in the tarball.',
  'archive-version': 'The tarball or the source package.json does not carry the planned version.',
  'archive-publish-config': 'package.json has publishConfig, which can move the registry or the tag; the route refuses it.',
  'archive-intake': 'The tarball folder is not one real folder holding exactly package.tgz.',
  'archive-file': 'package.tgz is not one regular, non-empty, unlinked file within the size bound.',
  'publish-directory': 'The publish folder is not a new empty folder apart from the tarball and the source.',
});

export class Refusal extends Error {
  constructor(code, detail) {
    const known = Object.hasOwn(REFUSALS, code);
    super(known ? code : 'unknown-refusal');
    this.name = 'Refusal';
    this.code = known ? code : 'unknown-refusal';
    // An unknown code is kept as the detail (the printer cleans it), so the bug is visible.
    this.detail = known ? (detail === undefined ? '' : String(detail)) : String(code);
  }
  get sentence() {
    return REFUSALS[this.code];
  }
}

export function refuse(code, detail) {
  throw new Refusal(code, detail);
}

// Any thrown value to a Refusal. Archive refusals keep their code and field; everything else
// the route did not name is `unexpected-failure` (never a pass, never a raw message).
export function asRefusal(error) {
  if (error instanceof Refusal) return error;
  const archive = archiveRefusal.archiveRefusalCode(error);
  if (typeof archive === 'string') {
    const cut = archive.indexOf(':');
    return cut < 0 ? new Refusal(archive) : new Refusal(archive.slice(0, cut), archive.slice(cut + 1));
  }
  return new Refusal('unexpected-failure', error?.name === 'TimeoutError' ? 'timeout' : '');
}
