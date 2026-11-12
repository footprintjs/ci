# The release route's refusals

Part of [RELEASE-ROUTE.md](RELEASE-ROUTE.md). THE table is `src/release-route/refusals.mjs`; this
list is generated from it, and `test/release-route/doc.test.mjs` fails when the two differ. A code
may carry a detail after it (`archive-path:package/notes.txt`, `settings-invalid:checks[1]`),
always cleaned before it is printed. `test/release-route/refusals-coverage.test.mjs` checks that
every stop the code names is in the table, nothing in the table is dead, and every code is named
by a test.

| Code | Sentence |
|---|---|
| `unknown-step` | The step is not one of plan, npm-tool, build, inspect, ready, verify, tag, notes. |
| `input-invalid` | An input the workflow passes is missing or malformed. |
| `output-invalid` | A value meant for a later job is outside its closed alphabet, so it is not written. |
| `unexpected-failure` | Something failed that the route has no name for; it stops rather than guess. |
| `unknown-refusal` | The route tried to stop with a reason it does not know; that is a stop as well. |
| `settings-unreadable` | .github/release.json is missing, not a regular file, or larger than its bound. |
| `settings-json` | .github/release.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `settings-unknown-key` | .github/release.json has a key the route does not know. |
| `settings-missing-key` | .github/release.json lacks a key every package must set. |
| `settings-invalid` | A setting in .github/release.json has the wrong type or is out of bounds. |
| `archive-setting` | The archive setting has a malformed, duplicate or always-allowed entry, a bare *, or an entry naming a file no setting may allow. |
| `package-unreadable` | package.json is missing, not a regular file, or larger than its bound. |
| `package-json` | package.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `not-publishable` | package.json says "private": true or has no name, so nothing is published. |
| `package-name-invalid` | The package name in package.json is not a valid npm name. |
| `version-not-plain` | The version is not plain x.y.z; prereleases are not released by this route yet. |
| `changelog-unreadable` | CHANGELOG.md is not a regular file, not UTF-8 text, or larger than its bound. |
| `changelog-missing` | CHANGELOG.md has no heading for this version outside fenced code and raw HTML (<pre>, <script>, <style>, <textarea>). |
| `changelog-duplicate` | CHANGELOG.md names this version's heading more than once, anywhere (a quote or code counts); it must appear once. |
| `git-failed` | A git question failed, so the route could not see the repository. |
| `checkout-mismatch` | The checkout is not the planned commit with a clean tree. |
| `request-failed` | A request could not be made or did not finish in time. |
| `response-status` | The server answered with a status the route does not accept. |
| `response-redirect` | The server answered with a redirect; the route never follows one. |
| `response-too-large` | The answer is larger than its bound. |
| `response-not-json` | The answer is not strict JSON (malformed, a duplicate key, or over a bound). |
| `response-shape` | The answer is JSON, but not the shape that was asked for. |
| `tarball-url` | npm names a tarball address that is not the expected one on registry.npmjs.org. |
| `fact-unreadable` | A fact the decision needs could not be read, so the route does not guess. |
| `tool-commit-invalid` | The release tool commit is not 40 lowercase hex characters. |
| `tool-not-reviewed` | The release tool commit is not on footprintjs/ci main, so it was never reviewed there. |
| `package-unknown` | npm does not know this package; the first publish of a new name is done by hand. |
| `tag-without-package` | The tag for this version exists but npm does not have the version; decide by hand. |
| `version-not-newer` | The version is not newer than every version npm already has. |
| `publish-off-main` | A real publish runs only from main. |
| `recover-off-main` | Recovering a release writes a tag and a GitHub release, so it runs only from main. |
| `release-unfinished` | npm has this version but no tag: use Re-run failed jobs on the run that published it, or tag v<version> at that commit by hand. |
| `no-rule-matched` | No rule of the decision matched these facts, so nothing is decided. |
| `output-folder` | The output folder is not an empty folder the route may write. |
| `node-version` | The Node running the build is not the major version the settings name. |
| `system-packages-failed` | Installing the system packages failed. |
| `install-failed` | The install command failed. |
| `check-failed` | A check failed. |
| `pack-failed` | npm pack failed. |
| `pack-output` | npm pack did not leave exactly one regular .tgz file. |
| `registry-differs` | npm serves different bytes for this version than the file the route built. |
| `registry-late` | npm did not show this version within the bounded wait. |
| `tag-elsewhere` | The tag for this version exists at another commit; the route never moves or reuses a tag. |
| `release-unexpected` | A GitHub release for this tag exists but is a draft or names another tag; decide by hand. |
| `npm-tool` | The vendored npm does not match its pinned digest, or its folder is not new, private and outside the checkout. |
| `invalid-archive` | The tarball is not the closed gzip/tar shape the route accepts. |
| `archive-profile` | The tarball uses a tar extension (long or non-ASCII path, PAX, GNU) the route refuses. |
| `manifest-json` | A package.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `manifest-source` | The packed package.json differs from the source package.json in a field other than version. |
| `archive-path` | The tarball holds a file the archive setting does not allow. |
| `archive-name` | The tarball holds a name some file system resolves to another file (case twin, trailing dot or space, ~, :, a Windows device name). |
| `archive-denied` | The tarball holds a file no setting may allow (root binding.gyp, server.js or npm-shrinkwrap.json; any .npmrc or node_modules). |
| `archive-missing` | A folder or file the archive setting requires is not in the tarball. |
| `archive-version` | The tarball or the source package.json does not carry the planned version. |
| `archive-publish-config` | package.json has publishConfig, which can move the registry or the tag; the route refuses it. |
| `archive-intake` | The tarball folder is not one real folder holding exactly package.tgz. |
| `archive-file` | package.tgz is not one regular, non-empty, unlinked file within the size bound. |
| `publish-directory` | The publish folder is not a new empty folder apart from the tarball and the source. |