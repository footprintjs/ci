# The shared release route (core scripts)

One release route for every package of the family, kept here once. A person merges a pull
request that changes the version; the route builds the package, checks the file, publishes that
exact file, proves npm serves the same bytes, and only then writes the tag and the GitHub release.

This page covers the part with no workflow in it: the modules in `src/release-route/` and the one
command the workflow will call, `node scripts/release-route.mjs <step>`. The workflow
(`release-route.yml`), the tag and the GitHub release come in the next pull request. Design and
rulings: `review-exchange/designs/shared-release-route-20261112.md` (section 12 wins).

Why it is built this way, in one line each:

- **Fail closed.** A route that says "fine" because it could not look is worse than none. Every
  stop is a named refusal and exit 1; no `catch` turns an exception into a pass.
- **One owner per rule.** One refusal table, one archive inspector, one decision table, one
  strict JSON reader, one bounded GET. Nothing has a second copy.
- **The decision is data.** An ordered table of equality tests over named facts; the first row
  that matches decides and its id is the printed reason. A later step runs the same table in a
  footprintjs chart and keeps the run record.
- **Built-in Node modules only.** The workflow runs these files from a plain checkout with no
  install, so nothing here imports an npm package.

## The steps

| Step | Job (next PR) | Reads (environment) | Does | Writes (`$GITHUB_OUTPUT`) |
|---|---|---|---|---|
| `plan` | plan: read only, no repo code runs | `GITHUB_SHA`, `GITHUB_REF`, `ROUTE_ACTION` (`publish` or `dry-run`), `ROUTE_TOOL_SHA` (`job.workflow_sha`), optional `GITHUB_TOKEN`, `GITHUB_API_URL` | observes the facts and runs the rule table | `rule`, `commit`, `package`, `version`, and on a decision `mode`, `compare` |
| `build` | build: no secret, no write right | `ROUTE_COMMIT`, `ROUTE_OUT` | the settings' system packages, install, checks, `npm pack --ignore-scripts`, one archive check | `file` (`package.tgz`) |
| `inspect` | publish, just before `npm publish` | `ROUTE_COMMIT`, `ROUTE_TARBALL_DIR` | the archive check again, with this repository's inspector | nothing |
| `verify` | verify | `ROUTE_PACKAGE`, `ROUTE_VERSION`, `ROUTE_TARBALL_DIR` | waits a bounded time for npm to show the version, then compares npm's integrity AND the downloaded tarball with the built file | nothing |
| `notes` | release | `ROUTE_COMMIT`, `ROUTE_OUT` | title and notes from `CHANGELOG.md` | `title-file`, `notes-file` |

`ROUTE_SOURCE` (default `.`) is the repository checkout in which every git question is asked.
Each step prints a short summary to the log and the same lines to `$GITHUB_STEP_SUMMARY`, and
exits 0 or 1 (`plan` exits 0 for `nothing`). Outputs only ever come from closed alphabets (a mode,
a rule id, `yes`/`no`, a 40-hex commit, a plain version, an npm name, a fixed file name): free
text such as the release title travels in a file.

Example, the plan for footprint-storydeck as it is today (from `test/release-route/command.test.mjs`):

```
Release route plan for commit a3936e304d8670f7fcec40d227df1309a994d46c of footprint-storydeck 0.13.1.
Facts seen: action=publish, toolCommitPlain=true, toolReviewed=true, settingsRead=true, ... tagExists=true, npmHasVersion=true, ...
Decision: rule released gives mode nothing, nothing to do: the version is tagged and on npm.
```

## The modules

Each file has one job; the WHY of each choice is in its header comment.

| File | Job |
|---|---|
| `refusals.mjs` | THE table of refusal codes and sentences. An unknown code is itself a refusal (`unknown-refusal`); an exception with no name is `unexpected-failure`. |
| `identity.mjs` | The shapes of a commit, a plain `x.y.z` and an npm name; "newer than every published version". |
| `text.mjs` | Cleans text the route does not control: control, format and bidi characters out, `::` and `##[` broken apart, bounded. |
| `report.mjs` | Lines to the log and the job summary (no line starts with untrusted text); outputs from closed alphabets only. |
| `settings.mjs` | Reads and validates `.github/release.json`; splits commands into argv lists. |
| `changelog.mjs` | Finds one version's section and title, in the `titled` and `keepachangelog` styles. |
| `http.mjs` | The one bounded GET: https only, redirects refused, one timeout, a byte bound. |
| `registry.mjs` | npm's answers from `registry.npmjs.org` only, never with a token; the bounded wait; the byte comparison. |
| `github.mjs` | The one GitHub question: is the tool commit on `footprintjs/ci` `main`? |
| `repo.mjs` | git with fixed arguments: committed blobs at a commit, the tag on origin, a clean checkout. |
| `rules.mjs` | The facts with their domains and the ordered rule table: data only. |
| `plan.mjs` | The pure evaluator of the table. |
| `observe.mjs` | Gathers the facts through injected doors; decides nothing. |
| `build.mjs` | The ONLY module that starts the repository's own commands. |
| `notes.mjs` | The release title and notes, written to files. |
| `command.mjs` | The steps, wired to the doors; `scripts/release-route.mjs` is its process entry. |
| `archive/` | The archive inspector: ONE port (`check-archive.cjs`), described below. |

## The settings file, `.github/release.json`

Only what really differs between packages. Not settings, on purpose: the package name (from
`package.json`), the tag format (`v<version>`), the release title, the npm version, the runner,
every timeout. storydeck's (also `test/release-route/fixtures/family/storydeck.release.json`):

```json
{
  "schema": 1,
  "node": "22",
  "systemPackages": ["ffmpeg"],
  "install": "npm ci",
  "checks": ["npm run test:cov", "npm run build", "npm run check:dist", "npx publint"],
  "archive": ["dist/", "plugin/", "site/public/deck-stage.js", "*.d.ts", "*.css", "CHANGELOG.md"],
  "changelog": "titled"
}
```

| Key | Type and bound |
|---|---|
| `schema` | the number `1` |
| `node` | the Node major as a string, `"22"` to `"99"`; build refuses when the running Node differs |
| `systemPackages` | up to 10 distinct Debian package names (`^[a-z0-9][a-z0-9+.-]{1,62}$`), installed with `sudo apt-get install -y --no-install-recommends` |
| `install` | one command |
| `checks` | 1 to 20 commands, run in order; the package is packed after the last, with lifecycle scripts off, so the list must build it |
| `archive` | what the tarball may hold (below) |
| `changelog` | `titled` or `keepachangelog` |

Every key is required and an unknown key is refused by name (`proposer` too, until the route
knows it). **Commands never reach a shell**: the text is split on single spaces into a program
(`npm`, `npx` or `node`) and arguments from `[A-Za-z0-9@%+=:,./_^~-]`; at most 32 parts, 200
characters. `&&`, `|`, `$( )`, quotes and redirects are refused, not passed on. Anything more
needs an npm script in `package.json`.

The settings written for the four packages that proved the shape are in
`test/release-route/fixtures/family/`. storyreel's publish check today runs
`npx @arethetypeswrong/cli ... --entrypoints $(node scripts/typed-entrypoints.mjs)`, a shell
substitution; its settings leave that check out until it is an npm script.

### The `archive` setting

- an entry ending in `/` is a folder that must hold at least one file (`"dist/"`);
- an entry with `*` is a wildcard for one or more characters of one name in its LAST path
  segment, and is optional (`"*.d.ts"`, `"tools/*.py"`);
- any other entry is one file that must be present (`"CHANGELOG.md"`);
- `package.json`, `README.md` and `LICENSE` are always allowed and never listed;
- anything else in the tarball is refused (`archive-path:<member>`); a required entry that is
  not there is `archive-missing:<entry>`.

Segments use `[A-Za-z0-9._@+-]`; no `.`, `..`, empty segment, leading `/`, `**`, braces or
second `*`. Owner: `src/release-route/archive/allowed.cjs`.

## The decision

`observe` reads the facts; `plan` runs the table. A fact that could not be read is `null`, and
the refusal that stopped it is printed beside it (`Unreadable fact settingsRead:
settings-unreadable ...`).

| Fact | Values |
|---|---|
| `action` | publish, dry-run |
| `toolCommitPlain` | true, false |
| `toolReviewed` | true, false |
| `settingsRead` | true |
| `packageNamed` | true, false |
| `packagePrivate` | true, false |
| `versionPlain` | true, false |
| `packageKnown` | true, false |
| `tagExists` | true, false |
| `npmHasVersion` | true, false |
| `changelogFound` | true, false |
| `versionNewer` | true, false |
| `refIsMain` | true, false |

`factsReadable` is false when any fact is `null` or outside its values.

The rows, first match wins (`src/release-route/rules.mjs`):

| # | Rule (the printed reason) | When (all must hold) | Result |
|---|---|---|---|
| 1 | `tool-commit-invalid` | toolCommitPlain = false | refuse `tool-commit-invalid` |
| 2 | `tool-not-reviewed` | toolReviewed = false | refuse `tool-not-reviewed` |
| 3 | `package-unnamed` | packageNamed = false | refuse `not-publishable` |
| 4 | `package-private` | packagePrivate = true | refuse `not-publishable` |
| 5 | `version-not-plain` | versionPlain = false | refuse `version-not-plain` |
| 6 | `package-unknown` | packageKnown = false | refuse `package-unknown` |
| 7 | `facts-unreadable` | factsReadable = false | refuse `fact-unreadable` |
| 8 | `released` | tagExists = true, npmHasVersion = true, action = publish | **nothing** (compare with npm: no) |
| 9 | `dry-run-released` | tagExists = true, npmHasVersion = true, action = dry-run | **dry-run** (compare with npm: yes) |
| 10 | `tag-without-package` | tagExists = true, npmHasVersion = false | refuse `tag-without-package` |
| 11 | `changelog-missing` | tagExists = false, changelogFound = false | refuse `changelog-missing` |
| 12 | `recover-off-main` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = false | refuse `recover-off-main` |
| 13 | `recover` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = true | **recover** (compare with npm: yes) |
| 14 | `dry-run-recover` | tagExists = false, npmHasVersion = true, action = dry-run | **dry-run** (compare with npm: yes) |
| 15 | `version-not-newer` | tagExists = false, npmHasVersion = false, versionNewer = false | refuse `version-not-newer` |
| 16 | `publish-off-main` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = false | refuse `publish-off-main` |
| 17 | `publish` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = true | **publish** (compare with npm: yes) |
| 18 | `dry-run-would-publish` | tagExists = false, npmHasVersion = false, action = dry-run | **dry-run** (compare with npm: no) |

Why this order:

- Refusals that need no other fact come first. Refusing is always safe, and some facts are not
  asked once one of them holds (no versions are read for a package npm does not know), so these
  rows must name the real reason before `facts-unreadable` would.
- `facts-unreadable` stands before every row that yields a mode: no mode is chosen while any
  fact is unknown.
- **Every mode that writes requires `refIsMain = true`** (`WRITING_MODES`: `publish` writes npm,
  the tag and the release; `recover` writes the tag and the release). Off `main` the same facts
  meet a named refusal (`publish-off-main`, `recover-off-main`). `dry-run` writes nothing and is
  allowed from any branch. A test holds every writing row to this, so a future writing mode
  cannot be added without it.
- A missing CHANGELOG section stops `recover` as well as `publish`: both write a GitHub release
  whose notes come from that section. A dry run is refused the same way, so it tells the truth
  about what a publish would do.
- `compare` tells the workflow whether `verify` runs: after a publish, for a recover (the rebuild
  must equal npm's bytes before anything is tagged), and for a dry run of a released version
  (which shows whether the build is byte-reproducible).

Rows that can match the same facts with different results say so (`outranks`: `'later'` for the
first seven, explicit lists for `changelog-missing` and `version-not-newer`).
`test/release-route/plan.test.mjs` enumerates all 4096 combinations of readable facts (and each
with one fact unknown) and fails on an overlap nobody declared, on a declaration that never
overlaps, on a combination no row meets, on any mode chosen with a fact unknown, and on any
writing mode chosen off `main`.

## Every refusal

THE table is `src/release-route/refusals.mjs`; this list is generated from it. A code may carry a
detail after it (`archive-path:package/notes.txt`, `settings-invalid:checks[1]`), always cleaned
before it is printed. `test/release-route/refusals-coverage.test.mjs` checks that every stop the
code names is in the table, nothing in the table is dead, and every code is named by a test.

| Code | Sentence |
|---|---|
| `unknown-step` | The step is not one of plan, build, inspect, verify, notes. |
| `input-invalid` | An input the workflow passes is missing or malformed. |
| `output-invalid` | A value meant for a later job is outside its closed alphabet, so it is not written. |
| `unexpected-failure` | Something failed that the route has no name for; it stops rather than guess. |
| `unknown-refusal` | The route tried to stop with a reason it does not know; that is a stop as well. |
| `settings-unreadable` | .github/release.json is missing, not a regular file, or larger than its bound. |
| `settings-json` | .github/release.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `settings-unknown-key` | .github/release.json has a key the route does not know. |
| `settings-missing-key` | .github/release.json lacks a key every package must set. |
| `settings-invalid` | A setting in .github/release.json has the wrong type or is out of bounds. |
| `archive-setting` | The archive setting has a malformed, duplicate or always-allowed entry. |
| `package-unreadable` | package.json is missing, not a regular file, or larger than its bound. |
| `package-json` | package.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `not-publishable` | package.json says "private": true or has no name, so nothing is published. |
| `package-name-invalid` | The package name in package.json is not a valid npm name. |
| `version-not-plain` | The version is not plain x.y.z; prereleases are not released by this route yet. |
| `changelog-unreadable` | CHANGELOG.md is not a regular file, not UTF-8 text, or larger than its bound. |
| `changelog-missing` | CHANGELOG.md has no section for this version. |
| `changelog-duplicate` | CHANGELOG.md has more than one section for this version. |
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
| `invalid-archive` | The tarball is not the closed gzip/tar shape the route accepts. |
| `archive-profile` | The tarball uses a tar extension (long or non-ASCII path, PAX, GNU) the route refuses. |
| `manifest-json` | A package.json is not strict JSON (malformed, a duplicate key, or over a bound). |
| `manifest-source` | The packed package.json differs from the source package.json in a field other than version. |
| `archive-path` | The tarball holds a file the archive setting does not allow. |
| `archive-missing` | A folder or file the archive setting requires is not in the tarball. |
| `archive-version` | The tarball or the source package.json does not carry the planned version. |
| `archive-publish-config` | package.json has publishConfig, which can move the registry or the tag; the route refuses it. |
| `archive-intake` | The tarball folder is not one real folder holding exactly package.tgz. |
| `archive-file` | package.tgz is not one regular, non-empty, unlinked file within the size bound. |
| `publish-directory` | The publish folder is not a new empty folder apart from the tarball and the source. |

## The archive inspector

There were three: footPrint's `scripts/publish-release/archive/` with `check-archive.cjs`,
agentfootprint's `scripts/publish-archive/`, and `src/guards/release-archive.cjs` here (a byte
copy of foottrace's, pinned in `provenance/upstream.json`, used only by the shadow; untouched and
not imported). **The base is footPrint's**, as the design recommends, because it is already split
into small modules (inspector, manifest, refusal, strict JSON), it reads every JSON with a strict
reader that refuses duplicate keys (the other two use `JSON.parse`, where the last duplicate
wins), and it carries its provenance file and its attack corpus (42 hostile archives).

It was copied byte for byte first (commit "copy footPrint's archive inspector byte for byte",
footPrint `531160b2124c11e373338bb65584909a1496a1f8`), and changed in the following commit, so a
reviewer reads only the difference. `provenance/release-route-archive.json` pins every file's
source path and SHA-256 and names each adaptation; `test/release-route/provenance.test.mjs`
fails if a file drifts without that record changing. What changed:

| File | Change |
|---|---|
| `inspector.cjs` | Allowed members from the `archive` setting (`allowed.cjs`) instead of `package/dist/` + `AGENTS.md`; the package name only from the source manifest; named refusals `archive-path`, `archive-missing`, `archive-version`, `archive-publish-config` where the copy said `invalid-archive`. |
| `allowed.cjs` | New: the one owner of the `archive` setting. |
| `check-archive.cjs` | The port: `readIntake(intake)` (the one reader of a built tarball) and `checkArchive(intake, sourceBytes, version, archive)`; the package name is no longer written in; the release-candidate operation and the CLI are gone (prereleases are a later phase; `candidate-version.cjs` was not copied); refusals go through `refusal.cjs`. `preparePublishDirectory` is kept for the publish job. |
| `refusal.cjs` | A `{ text }` field prints a label the route bounded first (a member path that passed the closed tar profile, or `entry-<n>`); otherwise hashed as before. |
| `strict-json.cjs` | `parseStrictJson(bytes, { maxBytes, maxValues })`, so every JSON the route reads uses this reader (npm's document for agentfootprint is over 1 MiB). `parseManifest` keeps its bounds. |
| tests | Moved to `test/release-route/archive/`, with footPrint's `package.json` at the same commit as their source-manifest fixture; refusal patterns name the new codes. |

Unchanged: the gzip and closed tar profile, checksums, padding, one member per name, regular
files only, no PAX/GNU/long/non-ASCII paths, the whole-manifest comparison except `version`,
the refusal of `publishConfig`, the resource bounds (16 MiB compressed, 64 MiB expanded, 10,000
files).

## Who can attack this, and what stops it

| Input or power | What stops it here |
|---|---|
| `package.json`, `CHANGELOG.md`, the settings file | Read as committed blobs at the planned commit (a symlink is refused, never followed), bounded (1 MiB, 2 MiB, 64 KiB), strict JSON with duplicate keys refused, exact types; text cleaned before printing or writing. |
| Tag names, git output | git runs with fixed arguments; a version reaches git only as plain `x.y.z`, a commit only as 40 hex; `ls-remote` output must match one exact line or nothing. |
| npm's and GitHub's answers | GET only to `registry.npmjs.org` and the GitHub API host, https, redirects refused, 30 s timeout over request and body, byte and value bounds, strict JSON, exact shapes; the tarball address must be exactly the one npm's rules give. |
| Every byte of the tarball | The archive inspector: closed gzip/tar profile, allowed paths only, manifest equal to the source except version, version equal to the plan, no `publishConfig`. |
| The log and later jobs | No line starts with untrusted text; `::` and `##[` are broken apart; control, format and bidi characters removed; the job summary is escaped inside `<pre>`; outputs from closed alphabets only. |
| The repository's own commands | Only `build` runs them, with no shell (argv lists from a closed alphabet), on the planned commit with a clean tree, with token variables removed from their environment. System package names match a strict pattern. |
| A token | Sent in one header to the GitHub API host only, never to npm, never in a message (and masked if one ever were). |
| A caller pinning an unreviewed ci commit | `tool-not-reviewed` unless the commit is on `footprintjs/ci` `main`. |
| A branch run that writes | Every writing mode requires `main`. |

**What this does not stop.** The content of the files the build produces is trusted as built: a
poisoned dependency at build time is not caught here. A reviewed change can weaken `checks`. A
person with write access can go around any workflow (including dispatching their own
`publish.yml` from a branch, which npm's trusted publishing accepts until the `npm` environment
step of design section 8 is done). A commit merged into ci `main` runs everywhere that pins it.

## Proof

Run on Node 24.21.0 and Node 22.16.0 (macOS), 12 Nov 2026.

- `npm run check`: 924 tests, 924 pass, 0 fail, then the build (and `npm test` on Node 22.16.0: 924 pass); `git diff --stat origin/main -- dist`
  is empty (these modules are not bundled into `dist/release.cjs`).
- **The four published tarballs through the port** (`checkArchive`, with the settings in
  `test/release-route/fixtures/family/` and each package's `package.json` at its release
  commit): footprint-storydeck 0.13.1 (81 files), footprint-storyreel 0.29.1 (365) and
  hcifootprint 4.1.0 (419) pass, and the integrity the inspector computes equals npm's
  `dist.integrity` for each. **agentfootprint-lens 0.81.0 is refused, `archive-publish-config`**:
  its `package.json` has `"publishConfig": {"access": "public", "provenance": true}`, which the
  inspector refuses on purpose. Lens must drop it when it moves to the route (unscoped packages
  are public by default, and the publish job asks for provenance itself). Its member list passes.
- **The same real storydeck tarball, made wrong**, each refused by name: no `*.css` entry →
  `archive-path:package/deck.css`; `types/` listed → `archive-missing:types/`; another name in
  the source → `manifest-source:name`; source and plan say 0.13.2 → `archive-version`; the plan
  differs from the source → `archive-version`. The member lists (paths only) are fixtures;
  `archive-family.test.mjs` repeats these on tarballs built from them.
- **The plan against the family today**: footprint-storydeck `main` at
  `a3936e304d8670f7fcec40d227df1309a994d46c` (real `package.json` and `CHANGELOG.md` blobs,
  checked by git blob id), its tags from `git ls-remote` on github.com, npm's real package
  document and GitHub's real compare answer for a ci commit on `main`, all saved on 12 Nov 2026,
  plus the `.github/release.json` storydeck's first pull request will add: rule `released`, mode
  `nothing` (`observe.test.mjs`, `command.test.mjs`).
- **The command, live** (GitHub, npm and github.com read over the network, GET only; Node's
  fetch needed `NODE_USE_ENV_PROXY=1` in the sandbox used): `plan` on storydeck `main` as it is
  refuses `fact-unreadable` (`settingsRead`: there is no `.github/release.json` yet) with every
  other fact read; with that file added in a local commit that was never pushed, `plan` gives
  `released` → `nothing`, and as a dry run from a branch `dry-run-released`. `verify` on the
  published storydeck 0.13.1 tarball passes; on another file it is `registry-differs`. `notes`
  writes `v0.13.1 — works beside footprintjs 12`. `inspect` of the published 0.13.1 tarball
  against `main` is refused `manifest-source:devDependencies`: `main` changed `package.json`
  after 0.13.1 was published, so a dry run of a released version on today's `main` cannot be
  byte-equal to npm. A reproducibility measurement must run at the release commit.
- **A red test for every refusal**: for each of the 55 codes the code raises, every quoted use of
  it in `src/release-route/` was replaced by `unexpected-failure` and the route's tests run again
  (a scratch script, not committed): every one of the 55 turned at least one test red. The other
  two codes (`unexpected-failure`, `unknown-refusal`) are what the table itself makes, pinned in
  `refusals.test.mjs`.

## Not in this pull request

The workflow files, the tag and GitHub release calls, the hold check calls, change notes,
`prepare`, the bot, `release-check.yml`, and any change in another repository. Prereleases are
refused (`version-not-plain`). The decision does not yet run inside a footprintjs chart.
