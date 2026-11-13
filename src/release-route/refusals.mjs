// THE table of refusals. Every stop anywhere in the release route is one of these codes, and
// what a person reads is the sentence here plus a short detail. A stop with a code that is not
// in the table is itself a stop (`unknown-refusal`), and an exception the route has no name for
// is `unexpected-failure`: nothing turns a failure into a pass.
//
// Why one table: a release that stops with "failed" teaches people to re-run until it is green.
// A code with a sentence says what to fix, and a test can pin each one (test/release-route/refusals.test.mjs).
import { types } from 'node:util';
import archiveRefusal from './archive/refusal.cjs';

export const REFUSALS = Object.freeze({
  // The command itself.
  'unknown-step': 'The step is not one this command runs (the plain command: plan, npm-tool, build, inspect, ready, verify, tag, notes; the bundle: plan, verify, why).',
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
  'archive-setting': 'The archive setting has a malformed, duplicate or always-allowed entry, a bare *, or an entry naming a file no setting may allow.',

  // package.json and CHANGELOG.md at the commit being released.
  'package-unreadable': 'package.json is missing, not a regular file, or larger than its bound.',
  'package-json': 'package.json is not strict JSON (malformed, a duplicate key, or over a bound).',
  'not-publishable': 'package.json says "private": true or has no name, so nothing is published.',
  'package-name-invalid': 'The package name in package.json is not a valid npm name.',
  'version-not-plain': 'The version is not plain x.y.z; prereleases are not released by this route yet.',
  'changelog-unreadable': 'CHANGELOG.md is not a regular file, not UTF-8 text, or larger than its bound.',
  'changelog-missing': 'CHANGELOG.md has no heading line for this version outside fenced code.',
  'changelog-duplicate': 'CHANGELOG.md names this version\'s heading more than once, anywhere (a quote or code counts); it must appear once.',

  // Git and the checkout.
  'git-failed': 'A git question failed, so the route could not see the repository.',
  'workflows-unreadable': 'A workflow file is a link, over its bound, one too many or not plain text, names the route other than on a plain uses: line, or no route pin is found.',
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
  'pins-differ': 'A workflow file here pins release-route.yml or release-check.yml of footprintjs/ci at another commit than the one running.',
  'package-unknown': 'npm does not know this package; the first publish of a new name is done by hand.',
  'tag-without-package': 'The tag for this version exists but npm does not have the version; decide by hand.',
  'version-not-newer': 'The version is not newer than every version npm already has.',
  'publish-off-main': 'A real publish runs only from main.',
  'recover-off-main': 'Recovering a release writes a tag and a GitHub release, so it runs only from main.',
  'finish-off-main': 'Finishing a release writes its GitHub release, so it runs only from main.',
  'release-unfinished': 'npm has this version but no tag: use Re-run failed jobs on the run that published it, or tag v<version> at that commit by hand.',
  'no-rule-matched': 'No rule of the decision matched these facts, so nothing is decided.',
  'plan-stale': 'The plan is no longer true: main moved on, or a newer version is on npm. This job published nothing; start a new run from main (a push or a dispatch).',

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

  // The release job and the pinned npm.
  'tag-elsewhere': 'The tag for this version exists at another commit; the route never moves or reuses a tag.',
  'tag-gone': 'Mode finish writes only the GitHub release of an existing tag, and the tag is gone; nothing was written.',
  'release-unexpected': 'A GitHub release for this tag exists but is a draft or names another tag; decide by hand.',
  'npm-tool': 'The vendored npm does not match its pinned digest, or its folder is not new, private and outside the checkout.',

  // The charted steps' record and its reader.
  'record-unwritten': 'The run\'s record could not be written to ROUTE_RECORD_DIR; a release with no record is not what this route promises.',
  'bundle-unloadable': 'The charted steps\' bundle could not be read or loaded, or it is not the file dist/release-route-metadata.json names; nothing was decided.',
  'record-unreadable': 'The file is not a release route record this reader can read (missing, too large, not strict JSON, or another shape).',

  // The archive inspector (src/release-route/archive/); codes may carry ":<field>".
  'invalid-archive': 'The tarball is not the closed gzip/tar shape the route accepts.',
  'archive-profile': 'The tarball uses a tar extension (long or non-ASCII path, PAX, GNU) the route refuses.',
  'manifest-json': 'A package.json is not strict JSON (malformed, a duplicate key, or over a bound).',
  'manifest-source': 'The packed package.json differs from the source package.json in a field other than version.',
  'archive-path': 'The tarball holds a file the archive setting does not allow.',
  'archive-name': 'The tarball holds a name some file system resolves to another file (case twin, trailing dot or space, ~, :, a Windows device name).',
  'archive-denied': 'The tarball holds a file no setting may allow (root binding.gyp, server.js or npm-shrinkwrap.json; any .npmrc or node_modules).',
  'archive-missing': 'A folder or file the archive setting requires is not in the tarball.',
  'archive-version': 'The tarball or the source package.json does not carry the planned version.',
  'archive-publish-config': 'package.json has publishConfig, which can move the registry or the tag; the route refuses it.',
  'archive-intake': 'The tarball folder is not one real folder holding exactly package.tgz.',
  'archive-file': 'package.tgz is not one regular, non-empty, unlinked file within the size bound.',
  'publish-directory': 'The publish folder is not a new empty folder apart from the tarball and the source.',
});

// A refusal is whatever THIS constructor made. Its code and detail are kept twice: in the public
// properties (for callers and tests, and anyone may reassign them) and in private fields only the
// constructor sets. `asRefusal` serves the private ones and never reads the public ones, so the
// test "is this a refusal" is the brand `#code in value`, which runs no getter and no Proxy trap
// (a Proxy, Object.create(Refusal.prototype) and a look-alike object all lack the field).
let privateRefusal;
export class Refusal extends Error {
  #code;
  #detail;
  static {
    // Reads the private fields of a value, or null when the constructor never made it.
    privateRefusal = (value) => (#code in value ? { code: value.#code, detail: value.#detail } : null);
  }
  constructor(code, detail) {
    const known = Object.hasOwn(REFUSALS, code);
    super(known ? code : 'unknown-refusal');
    this.name = 'Refusal';
    this.#code = known ? code : 'unknown-refusal';
    // An unknown code is kept as the detail (the printer cleans it), so the bug is visible.
    this.#detail = known ? (detail === undefined ? '' : String(detail)) : String(code);
    this.code = this.#code;
    this.detail = this.#detail;
  }
  get sentence() {
    return REFUSALS[this.code];
  }
}

export function refuse(code, detail) {
  throw new Refusal(code, detail);
}

// Any thrown value as a refusal. It never throws, and it runs no code of the thrown value: a
// getter or a Proxy trap could hold a secret or a message the route never cleaned, so the value is
// never asked for a property, a prototype or a descriptor (a Proxy answers each of those with its
// own code). Every read is inside one try all the same.
//
// A value is a refusal only when the Refusal constructor made it (the private-field brand above);
// what is served is the code and detail it was MADE with, even when its public fields were
// changed afterwards. Example: Object.create(Refusal.prototype, { code: { get() { return secret; } } })
// and a Proxy answering Refusal.prototype are unexpected-failure with an empty detail, and nothing
// of them runs. Archive refusals keep their code and field (a WeakMap lookup by identity, which
// runs no trap); everything else the route did not name is unexpected-failure (never a pass, never
// a raw message).
export function asRefusal(error) {
  try {
    return refusalOf(error);
  } catch {
    return new Refusal('unexpected-failure', '');
  }
}

// The value of an own data property, or undefined (a getter is never called). Only for a value
// that is not a Proxy.
const ownData = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const isObject = (value) => (typeof value === 'object' || typeof value === 'function') && value !== null;

function refusalOf(error) {
  if (isObject(error)) {
    const made = privateRefusal(error);
    if (made !== null) return new Refusal(made.code, made.detail);
  }
  const archive = archiveRefusal.archiveRefusalCode(error);
  if (typeof archive === 'string') {
    const cut = archive.indexOf(':');
    return cut < 0 ? new Refusal(archive) : new Refusal(archive.slice(0, cut), archive.slice(cut + 1));
  }
  return new Refusal('unexpected-failure', isTimeout(error) ? 'timeout' : '');
}

// A timeout keeps its name: an Error whose own `name` is the data value 'TimeoutError', or the
// platform's DOMException (whose `name` is the platform's own getter, not the thrown value's code).
// A Proxy is never asked: any question to it (a prototype, a descriptor) runs its trap.
function isTimeout(error) {
  if (!isObject(error) || types.isProxy(error)) return false;
  if (Object.hasOwn(error, 'name')) return ownData(error, 'name') === 'TimeoutError';
  return Object.getPrototypeOf(error) === DOMException.prototype && error.name === 'TimeoutError';
}
