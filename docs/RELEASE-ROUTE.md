# The shared release route (core scripts)

One release route for every package of the family, kept here once. A person merges a pull
request that changes the version; the route builds the package, checks the file, publishes that
exact file, proves npm serves the same bytes, and only then writes the tag and the GitHub release.

This page covers the part with no workflow in it: the modules in `src/release-route/` and the one
command the workflow will call, `node scripts/release-route.mjs <step>`. The workflow
(`release-route.yml`) comes later (see the last section). Design and rulings:
`review-exchange/designs/shared-release-route-20261112.md` (sections 12 and 13 win).

Why it is built this way, in one line each:

- **Fail closed.** A route that says "fine" because it could not look is worse than none. Every
  stop is a named refusal and exit 1; no `catch` turns an exception into a pass.
- **One owner per rule.** One refusal table, one archive inspector (and one tar reader), one
  decision table, one strict JSON reader. The bounded GET, the text cleaner and the GitHub host
  and token rule are shared with the hold check in `src/shared/` (neither tool imports the
  other). Nothing has a second copy.
- **No logic left for the workflow.** Every decision a job takes (what to do, whether npm
  already has the bytes, whether to write the tag and the release) is a step here, so the
  workflow only wires steps together.
- **The decision is data.** An ordered table of equality tests over named facts; the first row
  that matches decides and its id is the printed reason. The workflow runs the same table inside a
  footprintjs chart and keeps the run record: [RELEASE-ROUTE-CHART.md](RELEASE-ROUTE-CHART.md).
- **Built-in Node modules only.** The workflow runs these files from a plain checkout with no
  install, so nothing here imports an npm package. The one exception, `chart/`, runs from a
  committed bundle that holds its two libraries.

## The steps

| Step | Job (next PR) | Reads (environment) | Does | Writes (`$GITHUB_OUTPUT`) |
|---|---|---|---|---|
| `plan` | plan: read only, no repo code runs | `GITHUB_SHA`, `GITHUB_REF`, `ROUTE_ACTION` (`publish` or `dry-run`), `ROUTE_TOOL_SHA` (`job.workflow_sha`), optional `GITHUB_TOKEN` | observes the facts (git, npm, GitHub) and runs the rule table | `rule`, `commit`, `package`, `version`, and on a decision `mode`, `compare` |
| `npm-tool` | build and publish, first | `ROUTE_NPM_DIR` | checks `vendor/npm/npm-11.19.0.tgz` against both digests in `vendor/npm/manifest.json` and unpacks it (with the inspector's tar reader) into that new, private folder outside the checkout | nothing |
| `build` | build: no secret, no write right | `ROUTE_COMMIT`, `ROUTE_OUT`, `ROUTE_NPM_DIR` | the settings' system packages, install, checks, then `node <npm>/package/bin/npm-cli.js pack --ignore-scripts` (the runner's `npm` when `ROUTE_NPM_DIR` is not given), one archive check | `file` (`package.tgz`) |
| `inspect` | publish, just before `npm publish` | `ROUTE_COMMIT`, `ROUTE_TARBALL_DIR` | the archive check again, with this repository's inspector | nothing |
| `ready` | publish, after `inspect` | `ROUTE_PACKAGE`, `ROUTE_VERSION`, `ROUTE_TARBALL_DIR` | npm lacks the version → publish; npm has exactly these bytes → do not publish again (a re-run after npm accepted); other bytes → `registry-differs` | `publish` (`yes`/`no`) |
| `verify` | verify | `ROUTE_PACKAGE`, `ROUTE_VERSION`, `ROUTE_TARBALL_DIR` | waits a bounded time for npm to show the version, then compares npm's integrity AND the downloaded tarball with the built file | nothing |
| `tag` | release | `ROUTE_COMMIT`, `ROUTE_VERSION`, `GITHUB_REPOSITORY`, optional `GITHUB_TOKEN` | tag on origin: absent → create, at the commit → skip, elsewhere → `tag-elsewhere`; GitHub release: absent → create, present for the tag → skip, else `release-unexpected` | `tag`, `release` (`create`/`skip`) |
| `notes` | release | `ROUTE_COMMIT`, `ROUTE_OUT` | title and notes from `CHANGELOG.md` | `title-file`, `notes-file` |

In the workflow, `plan` and `verify` run charted, from the committed bundle, with the same inputs,
outputs and exit codes and one more input, `ROUTE_RECORD_DIR` (where the run's record is saved):
[RELEASE-ROUTE-CHART.md](RELEASE-ROUTE-CHART.md). The workflow never falls back to the plain steps
(W14): they leave no record, and exist as the oracle the charted steps are tested against and for
a person reading a failure.

A step that exits 1 never tells a later job to act (`report.mjs · end`). GitHub keeps a failed
step's outputs, and a later job that runs after a failure reads them, so the rule is about what is
in `$GITHUB_OUTPUT` when the step ends. It holds by these rules:

- Outputs are held until the step ends, and the end runs once.
- The end writes the job summary first, then every output in ONE append, the step's last write.
  A failing summary write (the path is a folder, read-only, or under a missing folder) or a failing
  output append leaves no output at all, and after a failed write nothing more is written.
- A refused step writes only the outputs that name the run (`rule`, `commit`, `package`,
  `version`), never `mode`, `compare`, `publish`, `tag`, `release` or a file name.
- That append is whole or nothing (`src/shared/append-whole.mjs · appendWhole`): when it fails
  part-way, the file is cut back to the size it had, so a step that exits 1 after a failed output
  write leaves `$GITHUB_OUTPUT` exactly as it found it.
- Second line of defence, the order inside the append: the names come first and `mode` is the last
  line, so a prefix the cut-back could not remove holds a line cut part-way (not a value of its
  closed alphabet) before it holds a whole `mode`. What is left: a write that fails AND a cut-back
  that fails, two independent failures of the same file.

The workflow uses the vendored npm for both `build`'s pack and the publish, so a rebuild and the
publish are made by one npm (`npm-tool`, then `build` with `ROUTE_NPM_DIR`).

**What `tag` cannot see: a draft release.** GitHub's REST documentation says the endpoint `tag`
reads, `GET /repos/{owner}/{repo}/releases/tags/{tag}`, returns "a published release with the
specified tag", so a draft is not found there and reads as absent (`create`); the `draft` branch of
`decideRelease` stays only as a guard. Only "List releases" shows drafts, and only to "users with
push access". A draft left by hand is therefore not detected, and the documentation for "Create a
release" says nothing about an existing draft with the same tag: the workflow's create step is
expected to make the published release beside it, leaving the draft for a person to delete. No
second GitHub question was added for this.

`ROUTE_SOURCE` (default `.`) is the repository checkout in which every git question is asked.
Each step prints a short summary to the log and the same lines to `$GITHUB_STEP_SUMMARY`, and
exits 0 or 1 (`plan` exits 0 for `nothing`). Outputs only ever come from closed alphabets (a mode,
a rule id, `yes`/`no`, `create`/`skip`, a 40-hex commit, a plain version, an npm name, a fixed
file name): free text such as the release title travels in a file.

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
| `report.mjs` | Lines to the log and the job summary (no line starts with untrusted text); outputs from closed alphabets only. |
| `settings.mjs` | Reads and validates `.github/release.json`; splits commands into argv lists. |
| `changelog.mjs` | Finds one version's section and title, in the `titled` and `keepachangelog` styles. |
| `http.mjs` | The route's words for the shared bounded GET (every failure a named refusal) and strict JSON answers. |
| `registry.mjs` | npm's answers from `registry.npmjs.org` only, never with a token; the bounded wait; the byte comparison. |
| `github.mjs` | The route's two GitHub questions: is the tool commit on `footprintjs/ci` `main`; is there a release for tag `v<version>`. |
| `repo.mjs` | git with fixed arguments: committed blobs at a commit, the tag's commit and the tip of `main` on origin, a clean checkout. |
| `rules.mjs` | The facts with their domains and the ordered rule table: data only. |
| `plan.mjs` | The pure evaluator of the table. |
| `observe.mjs` | Gathers the facts through injected doors; decides nothing. |
| `build.mjs` | The ONLY module that starts the repository's own commands. |
| `notes.mjs` | The release title and notes, written to files. |
| `ready.mjs` | The publish job's re-run decision (`decideReady`) and its facts. |
| `tag.mjs` | The release job's decisions (`decideTag`, `decideRelease`) and their facts. |
| `npm-tool.mjs` | The pinned npm: digests checked, unpacked, handed to build and publish. |
| `command.mjs` | The plain steps, wired to the doors; `scripts/release-route.mjs` is its process entry. |
| `step-common.mjs` | What the plain and the charted steps share: checked inputs, what plan and verify print, the step runner. |
| `bundle-door.mjs` | Opens the charted steps' bundle only when it is the file its metadata names. |
| `stdout.mjs` | How the entry points print a line: the token masked; a closed stdout ends the step quietly with exit 1, before its end writes anything. |
| `chart/` | `plan` and `verify` as footprintjs charts, the record, the `why` reader ([RELEASE-ROUTE-CHART.md](RELEASE-ROUTE-CHART.md)). |
| `archive/` | The archive inspector: ONE port (`check-archive.cjs`), described below. |
| `../shared/` | Shared with the hold check: `http.mjs · boundedGet` (https only, redirects refused, a held timer over the request and the body, a streaming byte bound), `text.mjs · clean` (control, format and bidi characters out, `::` and `##[` broken apart, bounded), `github.mjs` (the fixed host `https://api.github.com`, the token's shape, the headers). |

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
| `systemPackages` | up to 10 distinct Debian package names (`^[a-z0-9][a-z0-9+.-]{0,61}[a-z0-9+]$`: never ending in `-`, which apt-get reads as "remove"), installed with `sudo apt-get install -y --no-install-recommends` |
| `install` | one command |
| `checks` | 1 to 20 commands, run in order; the package is packed after the last, with lifecycle scripts off, so the list must build it |
| `archive` | what the tarball may hold (below) |
| `changelog` | `titled` or `keepachangelog` |

Every key is required and an unknown key is refused by name (`proposer` too, until the route
knows it). **Commands are started without a shell**: the text is split on single spaces into a
program (`npm`, `npx` or `node`) and arguments from `[A-Za-z0-9@%+=:,./_^~-]`; at most 32 parts,
200 characters. `&&`, `|`, `$( )`, quotes and redirects are refused, not passed on, so the
settings TEXT cannot be used for shell injection. That is all it does: the commands are still
the repository's own code (`npm run` uses a shell anyway, and `node --import=data:...` runs
whatever it is given) and can do anything the build job can. The job is the boundary, not the
alphabet. Anything more than one command needs an npm script in `package.json`.

**How a version's section is found** (`changelog.mjs`, failing closed instead of modelling
Markdown): the version's heading text (`## 0.13.1`, `## [4.1.0]`) must occur exactly once in the
whole file as plain text (twice, even in a fence, a `<code>` span or mid-line, is
`changelog-duplicate`, so a changelog must never quote its own version heading); that occurrence
must be a heading line outside fenced code (else `changelog-missing`); the section ends at the
next `## ` line outside a fence. HTML is not modelled: uniqueness already refuses a fake second
section, and a guess at HTML refused 80 of lens's 96 real sections over one `` `<script>` `` in
inline code.

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

Segments use `[A-Za-z0-9._@+-]`; no `.`, `..`, empty segment, leading `/`, `**`, braces, second
`*` or bare `*`. Owner: `src/release-route/archive/allowed.cjs`.

**What no setting may allow** (`archive-denied:<member>`, compared without letter case). The
copied inspector admitted a closed list and its README says why: "sibling `.npmrc`,
`binding.gyp` and `server.js` files refuse independently of manifest contents". Once the list
became a setting, `["dist/", "*"]` could have re-admitted them (found by the second reader).
These are the files npm gives a meaning of its own, so a build that adds one changes what a
consumer's install does while `package.json` still equals the source:

| Denied | Why |
|---|---|
| root `binding.gyp` | npm's default install script is `node-gyp rebuild` when it is there: code on every install |
| root `server.js` | npm's default start script is `node server.js` when it is there |
| root `npm-shrinkwrap.json` | npm installs the tree it pins, not the declared ranges (the one addition to the three the README names; the original refused it too) |
| any `.npmrc` | npm configuration: registry, scripts, credentials |
| any `node_modules` folder | dependency code shipped inside the package, around the declared dependencies |

A setting that names one of these, or is a bare `*`, is refused (`archive-setting`); a wildcard
that happens to match one (`*.js` and `server.js`) is allowed, because the deny list wins.

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
| `commitIsMainTip` | true, false |

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
| 11 | `not-main-tip` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = true, commitIsMainTip = false | **nothing** (compare with npm: no) |
| 12 | `unfinished-not-tip` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = true, commitIsMainTip = false | refuse `release-unfinished` |
| 13 | `changelog-missing` | tagExists = false, changelogFound = false | refuse `changelog-missing` |
| 14 | `recover-off-main` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = false | refuse `recover-off-main` |
| 15 | `recover` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = true, commitIsMainTip = true | **recover** (compare with npm: yes) |
| 16 | `dry-run-recover` | tagExists = false, npmHasVersion = true, action = dry-run | **dry-run** (compare with npm: yes) |
| 17 | `version-not-newer` | tagExists = false, npmHasVersion = false, versionNewer = false | refuse `version-not-newer` |
| 18 | `publish-off-main` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = false | refuse `publish-off-main` |
| 19 | `publish` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = true, commitIsMainTip = true | **publish** (compare with npm: yes) |
| 20 | `dry-run-would-publish` | tagExists = false, npmHasVersion = false, action = dry-run | **dry-run** (compare with npm: no) |

Why this order:

- Refusals that need no other fact come first. Refusing is always safe, and some facts are not
  asked once one of them holds (no versions are read for a package npm does not know), so these
  rows must name the real reason before `facts-unreadable` would.
- `facts-unreadable` stands before every row that yields a mode: no mode is chosen while any
  fact is unknown.
- **Every mode that writes requires `refIsMain = true` and `commitIsMainTip = true`**
  (`WRITING_MODES`: `publish` writes npm, the tag and the release; `recover` writes the tag and
  the release). Off `main` the same facts meet a named refusal (`publish-off-main`,
  `recover-off-main`). `dry-run` writes nothing and is allowed from any branch. A test holds
  every writing row to both, so a future writing mode cannot be added without them.
- **`commitIsMainTip` is measured**, not told: `git ls-remote origin refs/heads/main` must equal
  the planned commit. "Re-run" of an old run of `main` plans that run's OLD commit; with the
  version still unreleased it would otherwise publish older code. Such a run, for a version npm
  does NOT have, is `nothing` with its own rule (`not-main-tip`): a newer commit on `main`
  decides and its own run plans. Not a refusal, because an old run must not turn red for being
  old, so it also stands before `changelog-missing` and `version-not-newer` (those are the tip's
  run to raise). But when npm HAS the version and there is no tag, the version was published
  from this commit and its release never finished, and no later run will name it again: that is
  `unfinished-not-tip`, refused (`release-unfinished`) on purpose, telling the person to use
  "Re-run failed jobs" on the run that published it (it reuses that run's plan) or to write the
  tag at that commit by hand. `refIsMain` is still read from `GITHUB_REF`, which the runner sets.
- A missing CHANGELOG section stops `recover` as well as `publish`: both write a GitHub release
  whose notes come from that section. A dry run is refused the same way, so it tells the truth
  about what a publish would do.
- `compare` tells the workflow whether `verify` runs: after a publish, for a recover (the rebuild
  must equal npm's bytes before anything is tagged), and for a dry run of a released version
  (which shows whether the build is byte-reproducible).

Rows that can match the same facts with different results say so (`outranks`: `'later'` for the
first seven, explicit lists for `not-main-tip`, `unfinished-not-tip`, `changelog-missing` and
`version-not-newer`).
`test/release-route/plan.test.mjs` enumerates all 8192 combinations of readable facts (and each
with one fact unknown) and fails on an overlap nobody declared, on a declaration that never
overlaps, on a combination no row meets, on any mode chosen with a fact unknown, and on any
writing mode chosen off `main` or off its tip.

One thing the facts cannot see: npm's abbreviated document leaves out versions that were
published and then unpublished, so such a version reads as "newer" and plans `publish`; npm
itself then refuses the publish (it never reuses a version), so nothing wrong is written.

## Every refusal

Every stop is one code from THE table, `src/release-route/refusals.mjs`; the list of all of them,
each with its sentence, is in [RELEASE-ROUTE-REFUSALS.md](RELEASE-ROUTE-REFUSALS.md), generated
from that table and held to it by `test/release-route/doc.test.mjs`.

## The archive inspector

One port, footPrint's inspector copied byte for byte and then adapted; which base and why, what
changed file by file, and what is unchanged: [RELEASE-ROUTE-ARCHIVE.md](RELEASE-ROUTE-ARCHIVE.md).
The names no archive may hold, with why for each: `src/release-route/archive/README.md`.

## Who can attack this, and what stops it

| Input or power | What stops it here |
|---|---|
| `package.json`, `CHANGELOG.md`, the settings file | Read as committed blobs at the planned commit (a symlink is refused, never followed), bounded (1 MiB, 2 MiB, 64 KiB), strict JSON with duplicate keys refused, exact types; CHANGELOG fences read as CommonMark does; text cleaned before printing or writing. |
| Tag names, git output | git runs with fixed arguments; a version reaches git only as plain `x.y.z`, a commit only as 40 hex; `ls-remote` answers must be exactly the asked ref (and its peeled line) or nothing. |
| npm's and GitHub's answers | GET only to `registry.npmjs.org` and the FIXED host `https://api.github.com` (`GITHUB_API_URL` is not read; GitHub Enterprise is not supported), https, redirects refused, a held 30 s timer over the request and the body, byte and value bounds, strict JSON, exact shapes; the tarball address must be exactly the one npm's rules give. |
| Every byte of the tarball | The archive inspector in the publish job: closed gzip/tar profile, no name a file system would resolve to another file (case twins, a second `package.json`, trailing `.` or space, `~`, `:`, Windows device names; `archive-name`), allowed paths only, the fixed deny list (`binding.gyp`, `server.js`, `npm-shrinkwrap.json` at the root; any `.npmrc` or `node_modules`) whatever the setting says, manifest equal to the source except version, version equal to the plan, no `publishConfig`. This is the one check between a poisoned build and the publish right. |
| The log and later jobs | The route's own writes: no line starts with untrusted text; `::` and `##[` broken apart; control, format and bidi characters removed; the job summary escaped inside `<pre>`; outputs from closed alphabets only. |
| The repository's own commands | Only `build` runs them. They are started without a shell, so the settings text cannot inject shell; they are still the repository's own code and can do anything the build job can. They run on the planned commit with a clean tree (ignored files counted), and their environment has no file-command variable (`GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_PATH`, `GITHUB_STATE`, `GITHUB_STEP_SUMMARY`), no `ROUTE_*` input and nothing named like a secret (`token`, `secret`, `password`, `key`, `auth`, `credential`). That narrows; it is not a wall: code running as the runner user can find the file-command files, and on a hosted runner can read the runner's own credentials. So "no secrets in build" means "nothing this job's identity can do matters". System package names match a strict pattern. |
| A token | Sent in one header to `api.github.com` only, never to npm, never to a host an environment variable named, never in a message (and masked if one ever were). |
| A caller pinning a ci commit that is not on `main` | `tool-not-reviewed` catches the MISTAKE (a branch commit, a fork commit addressed through this repository). It cannot stop a caller who pins unreviewed code on purpose: that code is the code doing the check and can leave it out. The real gates are ci `main`'s review and the review of the caller's pin. |
| A run that writes from a branch, or from an old commit of `main` | Every writing mode requires `refIsMain` and the measured `commitIsMainTip`. |

**What this does not stop.** The content of the files the build produces is trusted as built: a
poisoned dependency at build time is not caught here. A reviewed change can weaken `checks`. A
person with write access can go around any workflow (including dispatching their own
`publish.yml` from a branch, which npm's trusted publishing accepts until the `npm` environment
step of design section 8 is done). A commit merged into ci `main` runs everywhere that pins it.

## What the workflow must keep

The workflow pull request is checked against this list. It is the second reader's, from round 2
of its read of this pull request, in its words; nothing in these scripts can enforce it.

- **W1.** `plan` runs in its own job, first, with no repository command before it; it checks out the CALLER at
  `GITHUB_SHA` with `persist-credentials: false`, and `ROUTE_SOURCE` points at that checkout, never at the ci tool's
  checkout (otherwise `origin`, the tags and the main tip are ci's).
- **W2.** No step before `plan` in that job writes git config, `insteadOf`, `GIT_*` variables, or `HOME`.
- **W3.** Before checking out ci, a step refuses a `job.workflow_sha` that is not 40 lowercase hex, and `ROUTE_TOOL_SHA`
  is set from that value only.
- **W4.** No job reads any output or file of the build job except the uploaded artifact. The build job's printed
  integrity and archive check are not evidence. The publish job re-runs `inspect` on the downloaded artifact.
- **W5.** The build job has `contents: read` only, no `id-token`, `persist-credentials: false`, no cache restore or
  save, and nothing after `build` in that job may be trusted (a detached process outlives the step).
- **W6.** The publish job installs nothing and runs no repository code: it runs `npm-tool` into a NEW folder under
  `RUNNER_TEMP` in that same job (never a folder or npm from another job), then `inspect`, the hold check, `ready`, and
  only on `publish=yes` `node <npm-dir>/package/bin/npm-cli.js publish <absolute package.tgz> --ignore-scripts
  --provenance` from an empty working folder.
- **W7.** `verify` runs after the publish job on both `publish=yes` and `publish=no` (and after a failed publish); the
  release job needs `verify` green.
- **W8.** The release job acts on `tag`'s answer in the same job: create with a non-force push of
  `<commit>:refs/tags/v<version>` (or the API), never `--force`, never moving a tag; the release title is passed from
  `title.txt` through an environment variable as ONE argument, notes with `--notes-file`.
- **W9.** `notes.md` is never printed to the log (it keeps `::`).
- **W10.** Every input reaches `run:` through `env:`; no `${{ … }}` inside a `run:` line.
- **W11.** The caller's concurrency group is per ref with `cancel-in-progress: false`, so two runs of `main` never
  plan/publish the same version at once.
- **W12.** `ROUTE_OUT`, `ROUTE_TARBALL_DIR` and `ROUTE_NPM_DIR` are fresh folders under `RUNNER_TEMP`, one per job.
- **W13.** The run summary must surface a `not-main-tip` decision with `npmHasVersion=true` (or the doc must tell people
  to use "Re-run failed jobs"), until the route prints it itself.

- **W14.** The workflow runs only the charted `plan` and `verify` (`node scripts/release-route-chart.mjs`), with
  `ROUTE_RECORD_DIR` set; no step ever falls back to the plain `plan` or `verify`, and a bundle that will not load
  (`bundle-unloadable`) stops the run. The plain steps leave no record; they are the oracle the charted steps are
  tested against, and a way for a person, outside the workflow, to read a failure.

Since round 3, the case W13 names is refused by the route itself (`unfinished-not-tip`,
`release-unfinished`), so the run is red and names what to do.

## Proof

What was run, on which Node, and what it gave: [RELEASE-ROUTE-PROOF.md](RELEASE-ROUTE-PROOF.md).

## Not in this pull request

The workflow files, the hold check calls, change notes, `prepare`, the bot, `release-check.yml`,
and any change in another repository. Prereleases are refused (`version-not-plain`).

## The next pull request

**The workflows**: `release-route.yml` and `release-check.yml`, wiring the steps above (the
charted `plan` and `verify` through `scripts/release-route-chart.mjs`, with `ROUTE_RECORD_DIR`
uploaded as an artifact) and keeping every rule under "What the workflow must keep".
