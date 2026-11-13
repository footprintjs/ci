# The shared release route

One release route for every package of the family, kept here once. A person merges a pull
request that changes the version; the route builds the package, checks the file, publishes that
exact file, proves npm serves the same bytes, and only then writes the tag and the GitHub release.

This page covers the modules in `src/release-route/`, the one command the workflows call,
`node scripts/release-route.mjs <step>`, and the two workflows that wire the steps into jobs,
`release-route.yml` and `release-check.yml` (section "The workflows"). Design and rulings:
`review-exchange/designs/shared-release-route-20261112.md` (sections 12 to 15 win).

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

| Step | Job | Reads (environment) | Does | Writes (`$GITHUB_OUTPUT`) |
|---|---|---|---|---|
| `plan` | plan: read only, no repo code runs | `GITHUB_SHA`, `GITHUB_REF`, `ROUTE_ACTION` (`publish` or `dry-run`), `ROUTE_TOOL_SHA` (`job.workflow_sha`), `GITHUB_REPOSITORY` (set by the runner), optional `GITHUB_TOKEN` | observes the facts (git, npm, GitHub, the caller's workflow files) and runs the rule table | `rule`, `commit`, `package`, `version`, and on a decision `node` (the settings' Node major, for the build job), `latest` (`yes` when the version is, or once published will be, the newest npm has), `compare`, `mode` |
| `npm-tool` | build and publish, first | `ROUTE_NPM_DIR` | checks `vendor/npm/npm-11.19.0.tgz` against both digests in `vendor/npm/manifest.json` and unpacks it (with the inspector's tar reader) into that new, private folder outside the checkout | nothing |
| `build` | build: no secret, no write right | `ROUTE_COMMIT`, `ROUTE_OUT`, `ROUTE_NPM_DIR` | the settings' system packages, install, checks, then `node <npm>/package/bin/npm-cli.js pack --ignore-scripts` (the runner's `npm` when `ROUTE_NPM_DIR` is not given), one archive check | `file` (`package.tgz`) |
| `inspect` | publish, just before `npm publish` | `ROUTE_COMMIT`, `ROUTE_TARBALL_DIR` | the archive check again, with this repository's inspector | nothing |
| `ready` | publish, after `inspect` | `ROUTE_PACKAGE`, `ROUTE_VERSION`, `ROUTE_TARBALL_DIR`, `ROUTE_COMMIT`, `ROUTE_SOURCE` | npm lacks the version → measures again, with the plan's own readers, that the commit is still the tip of `main` and the version still newer than every published one: both → publish; either not → `plan-stale`; either unreadable → `fact-unreadable`. npm has exactly these bytes → do not publish again (a re-run after npm accepted; the tip is not asked); other bytes → `registry-differs` | `publish` (`yes`/`no`) |
| `verify` | verify | `ROUTE_PACKAGE`, `ROUTE_VERSION`, `ROUTE_TARBALL_DIR` | waits a bounded time for npm to show the version, then compares npm's integrity AND the downloaded tarball with the built file | nothing |
| `tag` | release | `ROUTE_COMMIT`, `ROUTE_VERSION`, `ROUTE_MODE` (`publish`, `recover` or `finish`), `GITHUB_REPOSITORY`, optional `GITHUB_TOKEN` | tag on origin: absent → create (in mode `finish`: `tag-gone`, never create), at the commit → skip, elsewhere → `tag-elsewhere`; GitHub release: absent → create, present for the tag → skip, else `release-unexpected` | `tag`, `release` (`create`/`skip`) |
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
  `version`), never `mode`, `compare`, `node`, `publish`, `tag`, `release` or a file name.
- That append is whole or nothing (`src/shared/append-whole.mjs · appendWhole`): when it fails
  part-way, the file is cut back to the size it had, so a step that exits 1 after a failed output
  write leaves `$GITHUB_OUTPUT` exactly as it found it.
- Second line of defence, the order inside the append: the names come first and `mode` is the last
  line, so the order makes every cut but the last byte harmless: a prefix the cut-back could not
  remove holds a line cut part-way (not a value of its closed alphabet) before it holds a whole
  `mode`. The exception is the last byte: a write that fails on the final newline AND a cut-back
  that fails leaves a whole `mode=<value>` with no newline, which the runner may still read. That
  takes two independent failures of the same file, and no order of lines can close it (the last
  byte is always the newline of the last line).

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
Facts seen: action=publish, toolCommitPlain=true, toolReviewed=true, pinsAgree=true, settingsRead=true, ... tagExists=true, tagAtCommit=false, releaseExists=true, npmHasVersion=true, ...
Decision: rule released gives mode nothing, nothing to do: the version is tagged, on npm and has its GitHub release.
```

The decision line is the matching row's own sentence (`rules.mjs`, `says`), for a refusal too
(`Decision: rule package-private refuses not-publishable, package.json marks the package
private.`). Each row has its own because one sentence per mode was not true for every row of
that mode: `not-main-tip`, a `nothing`, printed "the version is tagged and on npm" for a version
that was neither (second reader of storydeck pull request 46). `test/release-route/rule-sentences.test.mjs`
holds that no two rows share a sentence and that no sentence states a fact its row does not require.

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
| `github.mjs` | The route's two GitHub questions: is the tool commit on `footprintjs/ci` `main`; is there a release for tag `v<version>` (asked by `plan` for `releaseExists` and by `tag`). |
| `repo.mjs` | git with fixed arguments: committed blobs at a commit (by path, or by blob id from a folder's listing), the tag's commit and the tip of `main` on origin, a clean checkout. |
| `pins.mjs` | Do the caller's workflow files pin the route at the commit running (`pinsAgree`)? A line rule over bounded, untrusted text; no YAML parser. |
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
| `pinsAgree` | true, false |
| `settingsRead` | true |
| `packageNamed` | true, false |
| `packagePrivate` | true, false |
| `versionPlain` | true, false |
| `packageKnown` | true, false |
| `tagExists` | true, false |
| `tagAtCommit` | true, false |
| `releaseExists` | true, false |
| `npmHasVersion` | true, false |
| `changelogFound` | true, false |
| `versionNewer` | true, false |
| `refIsMain` | true, false |
| `commitIsMainTip` | true, false |

`factsReadable` is false when any fact is `null` or outside its values.

Three facts came from the first real runs (13 November 2026):

- `pinsAgree`: every line of the caller's `.github/workflows/*.yml` / `*.yaml` at the planned commit
  whose first token is `uses:` (or `- uses:`) and which names
  `footprintjs/ci/.github/workflows/release-route.yml@...` or `.../release-check.yml@...` names
  exactly `ROUTE_TOOL_SHA` (compared exactly: the lower-case 40-character commit). That plain line
  is all the reader reads (no YAML parser on untrusted text), so it refuses what it could not read
  (`workflows-unreadable`). One rule decides what that is: a mention is counted on the file's text
  with only two kinds of comment removed (named below), and anything the reader is not certain
  about refuses. It refuses three things. A file it cannot be sure it sees as GitHub does ("not plain
  text" in the refusal's sentence), with the reason in the detail: not UTF-8 ("not UTF-8 text",
  such as a UTF-16 file with either byte-order mark), a NUL character ("a NUL character"), or
  NEL, LS or PS ("an unusual line-break character":
  YAML 1.1 ends a line at those and YAML 1.2 does not, and which one GitHub follows was not
  measured, so a `#` after one may or may not start a line). A file in which the route's path is
  named in more places than the plain lines gave pins, counted after removing only a line whose
  first character after spaces and tabs is `#` and, on a plain `uses:` line whose value is a value
  with no quote, or one quoted value with no backslash and no inner quote, a ` #...` right after
  the value, then all white space, with an escaped slash `\/` (as some
  JSON writers emit it) read as `/`. A `#` anywhere else stays, because it may sit inside a quoted
  value, where YAML reads it as text; so a block scalar, the value on the next line, a flow mapping
  (also one with a `#` in a quoted value before the pin, such as
  `release-check: { name: "Release check #2", uses: ... }`), a quoted key, a space before the
  colon, an anchor or alias, a `!!str` tag, a complex key, a JSON file (also a one-line one with
  `"name":"PR #checks"`, or with escaped slashes), a mention in a `run:` script or a `with:` value
  all refuse; removing white space is what makes a folded or split value visible. And no route
  pin at all across the files (the workflow that is running names the route, so none read means
  the reader missed it). What is not caught: (1) a value in quotes written over several lines, or
  a block scalar (`run: |`, `uses: >-`), inside which a line that starts with `#`, or with `uses:`
  and a value followed by ` #`, is read as if it stood outside, so the rest of that line is
  dropped as a comment though YAML reads it as content (in a quoted value the dropped rest can be a
  pin GitHub runs; in a block scalar it is that scalar's own text, so a `uses:` value built that
  way starts with `#` or `uses:`, not with the path); (2) an escape sequence other than `\/`
  inside a quoted value (`\x2e`, `\u002f`, a `\` line continuation); (3) a
  YAML tag that rewrites the value: `uses: !!binary <base64 of the path and pin>` decodes, in a
  YAML parser, to the path and pin, and so do its other spellings (`!<tag:yaml.org,2002:binary>`,
  a `%TAG` handle, a `%`-escaped suffix), while the text holds no mention. Of (3), what is known:
  GitHub's published workflow parser (`actions/languageservices`,
  `yaml-object-reader.ts · getLiteralToken`) rejects a value that is not a string, a number or a
  boolean; what is not known: GitHub's server parser was not measured. The three gaps have one
  cause (the reader reads text, not parsed values), and each needs a deliberately odd spelling by
  someone who can already change the workflow files. Every spelling
  `test/release-route/pins.test.mjs` lists agrees, differs or refuses as that test says (its
  known-gaps test pins all three). A regular file within the bounds, in UTF-8, that names neither
  workflow and holds no NEL, LS, PS or NUL says nothing. A route reached through a workflow of
  another repository is not seen: the reader reads only this repository's `.github/workflows`. `pins.mjs` reads at most 200 files of at most 512 KiB, each by its blob
  id (a name never becomes a git pathspec); a file that is not a regular blob (a link) or is over
  the bound is `workflows-unreadable`; lines are split on LF, CR and CRLF (NEL, LS and PS never
  reach the line rule: the file is refused first); nothing of a file leaves the reader but the
  first disagreeing file's name and the pin it found, both cleaned and cut. What an honest caller
  can be refused for: a symlinked workflow file (even one that does not name the route); a file
  that holds NEL, LS, PS or a NUL character, or is not UTF-8 (even one that does not name the
  route); a pin that is not the lower-case commit; a pin written directly before `,`, `}` or `]`
  (a flow mapping over several lines), which is read with that character and so prints
  `pins-differ` with a pin such as `<commit>,`; and the route's path with `@` named outside a
  plain `uses:` line and outside the two comments the reader removes, which includes a mention in
  a trailing comment on a line that is not a plain `uses:` line
  (`- run: echo hi # see footprintjs/ci/.github/workflows/release-check.yml@main`) and a comment
  after a `uses:` value that holds a backslash or an inner quote. Two of these are the price of
  the one rule: the file with NEL, LS, PS, NUL or bytes that are not UTF-8, and the mention
  outside the two removed comments. Write each pin as a plain
  `uses: footprintjs/ci/.github/workflows/release-....yml@<commit>` line; a mention on a `#` line,
  or in a comment right after a plain pin, is fine; a `uses:` line inside a `run: |` block counts as
  a pin.
- `tagAtCommit`: the tag `v<version>` exists AND names the planned commit, from the same
  `ls-remote` answer as `tagExists` (the tag peeled). With no tag it is `false` and nothing more is
  asked; an unreadable tag leaves both unknown with the same cause.
- `releaseExists`: GitHub has a PUBLISHED release for tag `v<version>`, read with the job's token
  from the fixed host by the release job's own rule (`tag.mjs · decideRelease`): none is `false`,
  one for exactly this tag is `true`, a release naming another tag is `release-unexpected` (the
  fact unknown, the cause printed). A draft is not seen: the endpoint answers only a published
  release (see "What `tag` cannot see" above), so a draft reads as no release, and `finish` (like
  `publish` and `recover`) is expected to write a published release beside it (not yet seen in a
  run; see "Still open"); `decideRelease`'s draft
  branch is a guard only. With no tag it is `false` and GitHub is not asked.

Every fact is read in every mode, a dry run and the pull-request check included, so they too turn
red (`fact-unreadable`) when GitHub or npm cannot answer; run them again.

The rows, first match wins (`src/release-route/rules.mjs`):

| # | Rule (the printed reason) | When (all must hold) | Result |
|---|---|---|---|
| 1 | `tool-commit-invalid` | toolCommitPlain = false | refuse `tool-commit-invalid` |
| 2 | `tool-not-reviewed` | toolReviewed = false | refuse `tool-not-reviewed` |
| 3 | `pins-differ` | pinsAgree = false | refuse `pins-differ` |
| 4 | `package-unnamed` | packageNamed = false | refuse `not-publishable` |
| 5 | `package-private` | packagePrivate = true | refuse `not-publishable` |
| 6 | `version-not-plain` | versionPlain = false | refuse `version-not-plain` |
| 7 | `package-unknown` | packageKnown = false | refuse `package-unknown` |
| 8 | `facts-unreadable` | factsReadable = false | refuse `fact-unreadable` |
| 9 | `released` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = true | **nothing** (compare with npm: no) |
| 10 | `dry-run-released` | tagExists = true, npmHasVersion = true, action = dry-run, tagAtCommit = true | **dry-run** (compare with npm: yes) |
| 11 | `dry-run-not-released-commit` | tagExists = true, npmHasVersion = true, action = dry-run, tagAtCommit = false | **dry-run** (compare with npm: no) |
| 12 | `tag-without-package` | tagExists = true, npmHasVersion = false | refuse `tag-without-package` |
| 13 | `finish-off-main` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = false, refIsMain = false | refuse `finish-off-main` |
| 14 | `finish-not-tip` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = false, refIsMain = true, commitIsMainTip = false | **nothing** (compare with npm: no) |
| 15 | `finish-tag-elsewhere` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = false, refIsMain = true, commitIsMainTip = true, tagAtCommit = false | refuse `tag-elsewhere` |
| 16 | `finish-changelog-missing` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = false, refIsMain = true, commitIsMainTip = true, tagAtCommit = true, changelogFound = false | refuse `changelog-missing` |
| 17 | `finish` | tagExists = true, npmHasVersion = true, action = publish, releaseExists = false, refIsMain = true, commitIsMainTip = true, tagAtCommit = true, changelogFound = true | **finish** (compare with npm: no) |
| 18 | `not-main-tip` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = true, commitIsMainTip = false | **nothing** (compare with npm: no) |
| 19 | `unfinished-not-tip` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = true, commitIsMainTip = false | refuse `release-unfinished` |
| 20 | `changelog-missing` | tagExists = false, changelogFound = false | refuse `changelog-missing` |
| 21 | `recover-off-main` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = false | refuse `recover-off-main` |
| 22 | `recover` | tagExists = false, npmHasVersion = true, action = publish, refIsMain = true, commitIsMainTip = true | **recover** (compare with npm: yes) |
| 23 | `dry-run-recover` | tagExists = false, npmHasVersion = true, action = dry-run | **dry-run** (compare with npm: yes) |
| 24 | `version-not-newer` | tagExists = false, npmHasVersion = false, versionNewer = false | refuse `version-not-newer` |
| 25 | `publish-off-main` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = false | refuse `publish-off-main` |
| 26 | `publish` | tagExists = false, npmHasVersion = false, action = publish, refIsMain = true, commitIsMainTip = true | **publish** (compare with npm: yes) |
| 27 | `dry-run-would-publish` | tagExists = false, npmHasVersion = false, action = dry-run | **dry-run** (compare with npm: no) |

Why this order:

- Refusals that need no other fact come first (the tool commit, the caller's pins of it, the
  package, the version, npm knowing the name). Refusing is always safe, and some facts are not
  asked once one of them holds (no versions are read for a package npm does not know), so these
  rows must name the real reason before `facts-unreadable` would. `pins-differ` names the file and
  the pin it found in its detail.
- `facts-unreadable` stands before every row that yields a mode: no mode is chosen while any
  fact is unknown.
- **Every mode that writes requires `refIsMain = true` and `commitIsMainTip = true`**
  (`WRITING_MODES`: `publish` writes npm, the tag and the release; `recover` writes the tag and
  the release; `finish` writes only the GitHub release, for a tag that already exists at this
  commit). Off `main` the same facts meet a named refusal (`publish-off-main`,
  `recover-off-main`, `finish-off-main`). `dry-run` writes nothing and is allowed from any branch.
  A test holds every writing row to both, so a future writing mode cannot be added without them.
- **A dry run of a released version compares with npm only at the released commit**
  (`dry-run-released` needs `tagAtCommit = true`). Between two releases a shipped file
  (`package.json`, the README) has usually changed, so the rebuild of a later commit differs from
  npm by design, and the dry run was red for no fault (storydeck runs 43334890647 and
  43336400518). At any other commit, `dry-run-not-released-commit`: nothing is compared with npm
  (the dry run's build is still checked and inspected; the pull-request check builds nothing).
- **The route keeps the tag, npm and the GitHub release in step.** A version that is tagged and on
  npm but has no published GitHub release is unfinished, not `released`. With the tag at this very commit on
  the tip of `main`, `finish` runs only the release job, which writes the release for the existing
  tag (its `tag` step answers `skip`; in this mode it refuses `tag-gone` rather than ever creating
  a tag, and the workflow's tag step runs only for `publish` and `recover`). It needs the version's
  CHANGELOG section, as `publish` and `recover` do (`finish-changelog-missing`). With the tag at
  another commit (main has moved on since the release), this run cannot write it (the release job
  writes from the planned commit and refuses a tag elsewhere), so the plan refuses at once with
  `tag-elsewhere` (`finish-tag-elsewhere`), and the decision line gives the way out: write the
  release for that tag by hand (below), or, if the release job of the run that made the tag failed,
  use "Re-run failed jobs" on that run while GitHub still allows it (not once someone has pressed
  "Re-run all jobs" on that run after main moved on: that attempt plans `finish-not-tip`, ends
  green, and leaves no failed job to re-run; then write the release by hand). Off the tip it is
  `nothing` (`finish-not-tip`: an old run does not turn red for being old), with the same way out
  in its sentence, and it promises nothing about another run, because no later run writes this
  release unless the tagged commit is the tip of main (then a run of main asked to publish plans
  `finish`); any other tip that keeps the version refuses `tag-elsewhere` and names the gap; a tip
  that raised the version never looks at the old version again. So a release deleted by hand comes
  back only on a run of `main` asked to publish while the tagged commit is still the tip (a
  dispatch of `publish`, or "Re-run all jobs" of the tagged commit's own push run; a new push
  always brings a newer commit); once `main` has moved on it is named in red by every push that
  keeps the version, and written by hand.

  **Writing the release by hand.** From a checkout of the package at the tagged commit and of
  footprintjs/ci, the route's own `notes` step writes the title and the notes, then `gh` makes the
  release for the existing tag. `<out>` is an absolute path to a new empty folder, and
  `<owner>/<repo>` the package's repository:

  ```
  ROUTE_COMMIT=<the tagged commit> ROUTE_OUT=<out> ROUTE_SOURCE=<the package checkout> \
    node <ci checkout>/scripts/release-route.mjs notes
  gh release create v<version> -R <owner>/<repo> --verify-tag --title "$(cat <out>/title.txt)" --notes-file <out>/notes.md \
    --latest   # or --latest=false when a newer version is on npm
  ```
- **`commitIsMainTip` is measured**, not told: `git ls-remote origin refs/heads/main` must equal
  the planned commit. "Re-run all jobs" of an old run of `main` plans that run's OLD commit
  again; with the version still unreleased it would otherwise publish older code. ("Re-run failed
  jobs" does not plan again at all: it reuses the old plan's outputs, which is why `ready`
  measures the tip and the newest version again in the publish job; see "The rule of the publish
  job" below.) Such a run, for a version npm
  does NOT have, is `nothing` with its own rule (`not-main-tip`): a newer commit on `main`
  decides and its own run plans. Not a refusal, because an old run must not turn red for being
  old, so it also stands before `changelog-missing` and `version-not-newer` (those are the tip's
  run to raise). But when npm HAS the version and there is no tag, the version was published
  from this commit and its release never finished, and a later run names it again only when the
  tip of `main` keeps the version (it then plans `recover` at the tip, unless an earlier row
  refuses): that is `unfinished-not-tip`, refused (`release-unfinished`) on purpose, telling the person to use
  "Re-run failed jobs" on the run that published it (it reuses that run's plan) or to write the
  tag at that commit by hand. `refIsMain` is still read from `GITHUB_REF`, which the runner sets.
- A missing CHANGELOG section stops `recover` as well as `publish`: both write a GitHub release
  whose notes come from that section. A dry run is refused the same way, so it tells the truth
  about what a publish would do.
- `compare` tells the workflow whether `verify` runs: after a publish, for a recover (the rebuild
  must equal npm's bytes before anything is tagged), and for a dry run at the commit a released
  version was tagged at (which shows whether the build is byte-reproducible). `finish` compares
  nothing: it writes no package and no tag.

Rows that can match the same facts with different results say so (`outranks`: `'later'` for
every row up to and including `facts-unreadable`, explicit lists for `not-main-tip`, `unfinished-not-tip`, `changelog-missing` and
`version-not-newer`).
`test/release-route/plan.test.mjs` enumerates all 65,536 combinations of readable facts (and each
with one fact unknown) and fails on an overlap nobody declared, on a declaration that never
overlaps, on a combination no row meets, on any mode chosen with a fact unknown, on any writing
mode chosen off `main` or off its tip, on a dry run of a tagged version that compares away from
the tagged commit, and on `finish` chosen without every one of its facts.

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
| The caller's workflow files (`pinsAgree`; a fork's pull request writes its own) | Listed once at the planned commit, at most 200, each read by its blob id (a name is never a pathspec), at most 512 KiB, a link refused; a line rule, no YAML parser, nothing evaluated; comment lines never start with `uses:`; only the first disagreeing file's name and pin leave the reader, cleaned and cut (100 and 80 characters), and nothing of them reaches a shell, an output or a file-command variable. It catches the mistake (one pin moved, the other forgotten); a person who edits the caller's workflow on purpose changes what runs. |
| Tag names, git output | git runs with fixed arguments; a version reaches git only as plain `x.y.z`, a commit only as 40 hex; `ls-remote` answers must be exactly the asked ref (and its peeled line) or nothing. |
| npm's and GitHub's answers | GET only to `registry.npmjs.org` and the FIXED host `https://api.github.com` (`GITHUB_API_URL` is not read; GitHub Enterprise is not supported), https, redirects refused, a held 30 s timer over the request and the body, byte and value bounds, strict JSON, exact shapes; the tarball address must be exactly the one npm's rules give. The plan's release question (`releaseExists`) is the release job's own (`readRelease`, 4 MiB, `tag_name` and `draft` of exact types; anything else is a refusal); the repository in its address is `GITHUB_REPOSITORY`, checked as `owner/name`. |
| Every byte of the tarball | The archive inspector in the publish job: closed gzip/tar profile, no name a file system would resolve to another file (case twins, a second `package.json`, trailing `.` or space, `~`, `:`, Windows device names; `archive-name`), allowed paths only, the fixed deny list (`binding.gyp`, `server.js`, `npm-shrinkwrap.json` at the root; any `.npmrc` or `node_modules`) whatever the setting says, manifest equal to the source except version, version equal to the plan, no `publishConfig`. This is the one check between a poisoned build and the publish right. |
| The log and later jobs | The route's own writes: no line starts with untrusted text; `::` and `##[` broken apart; control, format and bidi characters removed; the job summary escaped inside `<pre>`; outputs from closed alphabets only. |
| The repository's own commands | Only `build` runs them. They are started without a shell, so the settings text cannot inject shell; they are still the repository's own code and can do anything the build job can. They run on the planned commit with a clean tree (ignored files counted), and their environment has no file-command variable (`GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_PATH`, `GITHUB_STATE`, `GITHUB_STEP_SUMMARY`), no `ROUTE_*` input and nothing named like a secret (`token`, `secret`, `password`, `key`, `auth`, `credential`). That narrows; it is not a wall: code running as the runner user can find the file-command files, and on a hosted runner can read the runner's own credentials. So "no secrets in build" means "nothing this job's identity can do matters". System package names match a strict pattern. |
| A token | Sent in one header to `api.github.com` only, never to npm, never to a host an environment variable named, never in a message (and masked if one ever were). |
| A caller pinning a ci commit that is not on `main` | `tool-not-reviewed` catches the MISTAKE (a branch commit, a fork commit addressed through this repository). It cannot stop a caller who pins unreviewed code on purpose: that code is the code doing the check and can leave it out. The real gates are ci `main`'s review and the review of the caller's pin. |
| A run that writes from a branch, or from an old commit of `main` | Every writing mode requires `refIsMain` and the measured `commitIsMainTip`. |
| Mode `finish` (writes a GitHub release with no build and no verify) | Chosen only on the tip of `main`, for a tag that names this commit and a version npm has; the release job's tag step refuses rather than create a tag in that mode (`tag-gone`) and refuses a tag elsewhere, and the workflow runs its tag-creating step only for `publish` and `recover`. It writes the release's title and notes from the commit's CHANGELOG, as the other modes do. |

**What this does not stop.** The content of the files the build produces is trusted as built: a
poisoned dependency at build time is not caught here. A reviewed change can weaken `checks`. A
person with write access can go around any workflow (including dispatching their own
`publish.yml` from a branch, which npm's trusted publishing accepts until the `npm` environment
step of design section 8 is done). A commit merged into ci `main` runs everywhere that pins it.

## What the workflow must keep

The workflow pull request is checked against this list. It is the second reader's, from round 2
of its read of this pull request, in its words; nothing in these scripts can enforce it. Under each
rule, how `release-route.yml` keeps it and the test that holds it there (`test/workflow/`, reading
the workflow as parsed YAML), or why no test can.

- **W1.** `plan` runs in its own job, first, with no repository command before it; it checks out the CALLER at
  `GITHUB_SHA` with `persist-credentials: false`, and `ROUTE_SOURCE` points at that checkout, never at the ci tool's
  checkout (otherwise `origin`, the tags and the main tip are ci's).
  - Kept: the plan job's steps before the plan step are exactly the tool guard, the caller's checkout at
    `${{ github.sha }}` into `source`, the tool's checkout into `tool`, and the Node setup; `ROUTE_SOURCE` is
    `source`. Test: `release-route.test.mjs` "W1, W2", and "every checkout leaves no credentials behind".
- **W2.** No step before `plan` in that job writes git config, `insteadOf`, `GIT_*` variables, or `HOME`.
  - Kept: no `env:` at the workflow or job level; no step up to the plan step sets a `GIT_*` or `HOME` variable or
    runs `git`. Test: "W1, W2". Not testable here: what `actions/checkout` itself writes. With
    `persist-credentials: false` it leaves the checkout's own `.git/config` (the origin URL, which W1 needs) and,
    by its documentation, no credential; the first real run is where that is seen.
- **W3.** Before checking out ci, a step refuses a `job.workflow_sha` that is not 40 lowercase hex, and `ROUTE_TOOL_SHA`
  is set from that value only.
  - Kept: the first step of EVERY job (each one checks out the tool) is the same guard, with
    `ROUTE_TOOL_SHA: ${{ job.workflow_sha }}` in `env:`; every `ROUTE_TOOL_SHA` in the file is that value. Test:
    "W3", which also runs the guard's script in bash on good and bad values (empty, `main`, upper case, 39 and 41
    characters, a trailing newline or space).
- **W4.** No job reads any output or file of the build job except the uploaded artifact. The build job's printed
  integrity and archive check are not evidence. The publish job re-runs `inspect` on the downloaded artifact.
  - Kept: the build job has no `outputs:` and nothing reads `needs.build.outputs`; it uploads one artifact,
    `release-route-package`, and only publish and verify download it, by that name. Test: "W4", and "W6" for
    `inspect` in the publish job.
- **W5.** The build job has `contents: read` only, no `id-token`, `persist-credentials: false`, no cache restore or
  save, and nothing after `build` in that job may be trusted (a detached process outlives the step).
  - Kept: the permissions are exactly `contents: read`; the step after `build` is only the upload; no token is
    in the job. Test: "W5", "least power", "no cache restore or save anywhere". `actions/setup-node` v7.1.0
    restores a cache when its `cache` input is given (no step gives one) or, since v5, by itself when
    `$GITHUB_WORKSPACE/package.json` names npm as its package manager (`src/main.ts ·
    getNameFromPackageManagerField`; its post step saves only what that step set up). The route's
    workspace holds only the `source` and `tool` checkouts, so nothing matches, and every setup-node says
    `package-manager-cache: false` so this does not rest on the folder layout.
- **W6.** The publish job installs nothing and runs no repository code: it runs `npm-tool` into a NEW folder under
  `RUNNER_TEMP` in that same job (never a folder or npm from another job), then `inspect`, the hold check, `ready`, and
  only on `publish=yes` `node <npm-dir>/package/bin/npm-cli.js publish <absolute package.tgz> --ignore-scripts
  --provenance` from an empty working folder.
  - Kept: the steps, in order: guard, tool checkout, caller checkout (data for `inspect`, no credentials), Node,
    download the package into a fresh folder, `npm-tool` into `${{ runner.temp }}/npm`, `inspect`, `ready`, the
    hold check, then the publish on `publish == 'yes'`: `mkdir` a fresh `${{ runner.temp }}/empty` (no `-p`, so
    an existing folder fails), `cd` into it, and the command above. Every other script is
    `node "$GITHUB_WORKSPACE/tool/scripts/release-route.mjs" <step>`: the tool by its absolute place, so no
    working directory can turn it into the caller's file of the same name. The publish job's (and the plan
    job's) steps are compared WHOLE with the test's own copy, and in every job of both files a step may have
    only `name`, `id`, `if`, `uses`, `with`, `env`, `run` (no `continue-on-error`, `working-directory`,
    `shell`); no env names `NODE_OPTIONS`, `NODE_PATH` or `npm_config_*`; every setup-node has exactly `node-version` and `package-manager-cache: false`.
    Tests: "W6" (both) and "least power" in `release-route.test.mjs`, and `release-route-steps.test.mjs`.
  - One departure from the order written above: the hold check runs AFTER `ready`, directly before the
    publishing step, because the hold check's own rule (`docs/HOLD.md`: the step goes "directly before
    `npm publish`") wants the moment it looks to be the last one before the publish; `ready` only reads npm.
- **W7.** `verify` runs after the publish job on both `publish=yes` and `publish=no` (and after a failed publish); the
  release job needs `verify` green.
  - Kept, with one exception: mode `finish`, which writes only the GitHub release of a tag that already names the
    planned commit and a version npm already has, runs no build and no verify, and its release job runs only with
    verify skipped (test: "the release job runs for finish only with verify skipped").
  - Kept: the conditions between the jobs (section "The workflows", the truth table). Test:
    `release-route-conditions.test.mjs`, which evaluates every job's `if:` from the YAML over every mode, a
    refused plan, and every result of every job that runs, and computes the doc's table again.
- **W8.** The release job acts on `tag`'s answer in the same job: create with a non-force push of
  `<commit>:refs/tags/v<version>` (or the API), never `--force`, never moving a tag; the release title is passed from
  `title.txt` through an environment variable as ONE argument, notes with `--notes-file`.
  - Kept: in the release job, `tag` then `notes`; on `tag == 'create'`, and only in mode `publish` or
    `recover`, the API's create-only call (`gh api --method POST repos/<repo>/git/refs`, which answers 422
    when the tag exists, so no tag can move whatever the earlier answer was); on `release == 'create'`,
    `gh release create v<version> --verify-tag <--latest or --latest=false> --title "$title" --notes-file
    <notes.md>`, the title read from `title.txt` into one quoted shell variable, "Latest" from the plan's
    `latest` (`yes`: `--latest`; `no`: `--latest=false`; anything else: the step refuses and creates
    nothing). Test: "W8, W9" (no `--force`, `PATCH`, `git push` or `git tag` anywhere), and the release
    step run by bash with `gh` standing in.
- **W9.** `notes.md` is never printed to the log (it keeps `::`).
  - Kept: `notes.md` appears once in the file, as the `--notes-file` argument. Test: "W8, W9". What `gh` itself
    prints is not testable here; it prints the release's address, not its notes.
- **W10.** Every input reaches `run:` through `env:`; no `${{ … }}` inside a `run:` line.
  - Kept, and narrowed: outside `env:`, an expression reads only a closed alphabet (`mode`, `compare`, `commit`,
    `node`, a job's result, `publish`, `tag`, `release`) or a fixed context; in `env:`, the plan's `commit`,
    `package`, `version`, `mode` and `latest`, the input, or a fixed context. Test: "W10".
- **W11.** The caller's concurrency group is per ref and per kind of run, with `cancel-in-progress: false`:
  `release-${{ github.ref }}-${{ github.event_name == 'push' && 'publish' || inputs.action }}`. The runs that may
  publish (a push, a dispatch of `publish`) share one group, so two of them never plan/publish the same version at
  once; a dry run has a group of its own.
  - Kept in the caller, which a package writes (below); `release-route.yml` has no `concurrency:`, as GitHub
    advises against the same group in caller and called workflow. Test: "W11" parses the caller shown in this
    doc and holds its `with:` to the route's inputs. Each package's own file is checked when it adopts the
    route, not here. Why a group per kind: GitHub keeps one running and one pending run per group, and a newer
    queued run cancels a PENDING one. With one group per ref, a manual dry run queued behind a running release
    could cancel a release push still waiting (GitHub's rule, read by the second reader of storydeck pull request
    46; not seen in a run), and the version would stay unpublished until the next push. Now a newer run cancels
    only a pending run of its own kind, and a dry run never cancels one; among runs that may publish the newest
    plans the tip, but a version raised only in the cancelled push is skipped: never published or tagged.
- **W12.** `ROUTE_OUT`, `ROUTE_TARBALL_DIR` and `ROUTE_NPM_DIR` are fresh folders under `RUNNER_TEMP`, one per job.
  - Kept: each is `${{ runner.temp }}/<name>`, one folder per variable in a job, no two variables sharing one
    (`ROUTE_RECORD_DIR` and the publish's empty folder too). Fresh because GitHub empties `RUNNER_TEMP` at the
    start of each job, and because each step refuses a folder that is not new or empty (`npm-tool`: must not exist;
    `build` and `notes`: absent or empty; `inspect`, `ready`, `verify`: exactly `package.tgz`; the record: never
    over a file). Test: "W12".
- **W13.** The run summary must surface a `not-main-tip` decision with `npmHasVersion=true` (or the doc must tell people
  to use "Re-run failed jobs"), until the route prints it itself.
  - Kept by the route itself since round 3 (below). Test: "W13" pins the row.

- **W14.** The workflow runs only the charted `plan` and `verify` (`node scripts/release-route-chart.mjs`), with
  `ROUTE_RECORD_DIR` set; no step ever falls back to the plain `plan` or `verify`, and a bundle that will not load
  (`bundle-unloadable`) stops the run. The plain steps leave no record; they are the oracle the charted steps are
  tested against, and a way for a person, outside the workflow, to read a failure.
  - Kept: the only `release-route-chart.mjs` calls are `plan` (plan job) and `verify` (verify job), each with
    `ROUTE_RECORD_DIR`, each followed by the record's upload on `!cancelled()`; every other script is a plain
    step other than `plan` and `verify`. A bundle that will not load exits 1, so its job fails and nothing
    after it runs. Test: "W14".

Since round 3, the case W13 names is refused by the route itself (`unfinished-not-tip`,
`release-unfinished`), so the run is red and names what to do.

## Proof

What was run, on which Node, and what it gave: [RELEASE-ROUTE-PROOF.md](RELEASE-ROUTE-PROOF.md).

## The workflows

Two reusable workflows (`on: workflow_call`) wire the steps above into jobs. Each job runs steps and
reads their closed-alphabet outputs; no job decides anything of its own. The tool (this repository) is
checked out in every job at `job.workflow_sha`, the commit of the workflow file itself, so a caller has
one pin, and the first step of every job refuses a value that is not 40 lowercase hex before any
checkout (an empty value would check out ci's default branch).

### `release-route.yml`: the route

One input, `action` (`publish` or `dry-run`; anything else is refused by `plan`, not by YAML). No secret.
`permissions: {}` at the top; each job asks for its own.

**The rule of the publish job.** (The hold, below, stops a publish. It does not stop `recover` or
`finish`: those tag and release a version npm already serves, and the release records what npm
serves whatever the hold says, design question 6.) Everything that must be true at the moment of publishing is
measured in the publish job, directly before the publishing step. The plan decides whether to try;
it is never the proof. GitHub's "Re-run failed jobs" keeps the outputs of the jobs it does not
re-run, so a publish job re-run days later works from the OLD plan: its commit and its version.
Without this rule a held 1.4.0, re-run after 1.5.0 was published, would publish 1.4.0 and move
npm's `latest` backward. So the publish job asks, in this order: `inspect` (the package is the
commit's), `ready` (when npm lacks the version: the commit is still the tip of `main` and the
version still newer than every published one, else `plan-stale`; when npm has it: the same
bytes), and the hold check, directly before the publish. The hold is the same lesson one level
down (the hold JOB's green result is reused on a re-run; the step is asked again).

```
plan ─┬─▶ hold ─▶ build ─▶ publish ─▶ verify ─▶ release    publish
      ├─────────▶ build ──────────────▶ verify ─▶ release    recover (the hold is not asked)
      ├─▶ hold ─▶ build ──────────────▶ verify               dry-run, compare=yes
      ├─▶ hold ─▶ build                                      dry-run, compare=no
      ├──────────────────────────────────────────▶ release   finish (the hold is not asked)
      └─ nothing more                                        nothing, or a refused plan
```

| Job | Runs when | Permissions | What it does |
|---|---|---|---|
| plan | always | `contents: read` | the caller at `github.sha` into `source` (no credentials kept), the tool into `tool`, Node 22, the charted `plan`; its record is uploaded passed or refused. Its outputs are exactly the step's: `rule`, `commit`, `package`, `version`, `node`, `latest`, `compare`, `mode` |
| hold | mode `publish` or `dry-run` (not `recover` or `finish`: a hold stops a publish, not the tag and release of a version npm already serves) | `contents`, `issues`, `pull-requests`: read | the hold check (`.github/actions/hold` from the tool checkout, mode fixed to `publish`): the early signal, before the build spends its minutes |
| build | mode `publish` or `dry-run` after a green hold; mode `recover` | `contents: read` | the caller at the planned commit, the Node the settings name (the plan's `node` output), `npm-tool`, `build`; uploads `package.tgz` as `release-route-package`, the one thing other jobs may read |
| publish | mode `publish` after a green build | `contents: read`, `id-token: write`, `issues: read`, `pull-requests: read` | downloads the package, `npm-tool` in this job, `inspect`, `ready` (which measures the plan again: the tip of `main`, the newest version), the hold check as a step, and on `publish=yes` the publish from an empty folder. Installs nothing, runs no repository code |
| verify | `compare=yes` after a green build; for `publish`, after the publish job succeeded OR failed | `contents: read` | downloads the package, the charted `verify`; its record is uploaded passed or refused |
| release | mode `publish` or `recover` after a green verify; mode `finish` (verify skipped) | `contents: write` | `tag` (with the mode), `notes`, then the tag (create-only API call; `publish` and `recover` only) and the GitHub release ("Latest" only when `latest` is `yes`), each only on `tag`'s `create` |

**The conditions.** GitHub skips a job whose needed job was skipped or failed unless its `if:` holds a
status function, and otherwise adds an implied `success()`. To leave nothing implied, every job but
`plan` starts its `if:` with `!cancelled() && needs.plan.result == 'success'` and names the result of
each job it depends on: the truth table is the expression alone. The expressions use a few forms only
(`cancelled()`, `!`, `&&`, `||`, parentheses, and `<job result or output> == '<word>'`; any other form
is refused by the tests' evaluator, `test/workflow/support/expression.mjs`), and
`test/workflow/release-route-conditions.test.mjs` evaluates them from the YAML over every mode, a
refused plan, a plan whose job failed after the step passed (GitHub keeps the step's outputs), a
cancelled run, and every result of every job that runs. It checks each job against the rule in the
table above, that no job runs because a job it needs FAILED except `verify` after a failed publish
(W7), that publish and release run only for a plan that PASSED with `publish`, `recover` or
`finish`, and that `finish` runs the release job and nothing else. It also computes this table
again ("runs", or "-" for skipped):

<!-- route-truth-table -->
| Case | hold | build | publish | verify | release |
|---|---|---|---|---|---|
| plan refused (exit 1: only the names of the run are written) | - | - | - | - | - |
| plan passed, then a later step of its job failed (outputs kept) | - | - | - | - | - |
| the run is cancelled | - | - | - | - | - |
| `nothing` | - | - | - | - | - |
| `publish`, every job green | runs | runs | runs | runs | runs |
| `publish`, hold red | runs | - | - | - | - |
| `publish`, build red | runs | runs | - | - | - |
| `publish`, build cancelled | runs | runs | - | - | - |
| `publish`, publish red, verify green | runs | runs | runs | runs | runs |
| `publish`, publish red, verify red | runs | runs | runs | runs | - |
| `publish`, publish cancelled | runs | runs | runs | - | - |
| `publish`, verify red | runs | runs | runs | runs | - |
| `recover`, every job green | - | runs | - | runs | runs |
| `recover`, build red | - | runs | - | - | - |
| `recover`, verify red | - | runs | - | runs | - |
| `finish` | - | - | - | - | runs |
| `dry-run`, compare=yes, every job green | runs | runs | - | runs | - |
| `dry-run`, compare=no, every job green | runs | runs | - | - | - |
| `dry-run`, hold red | runs | - | - | - | - |
<!-- /route-truth-table -->

Two rows to read twice:

- **publish red, verify green: the release runs.** The publish job can fail after npm accepted the file
  (the command's own exit, a lost connection), or at a step before it while npm already serves the same
  bytes from an earlier attempt. `verify` then proves npm serves exactly the bytes this run built, and the
  tag records that (design question 6: a hold set after npm accepted still tags). If npm does not have
  the version, `verify` waits its bounded time and refuses (`registry-late`), and nothing is tagged.
- **publish cancelled: verify does not run.** A cancelled publish is not a failed one. If it was
  cancelled after npm accepted, the next run's plan sees "on npm, no tag" and recovers, or a person uses
  "Re-run failed jobs" on this run (`ready` answers `no` when npm has the same bytes, verify and release
  follow). Whether GitHub reports
  a job that hit its `timeout-minutes` as `cancelled` or `failure` is not written in the documents read for
  this; the first real run that times out will show it, and either way nothing is tagged unproven.

No condition in this file is what stops a publish from a branch or from an old commit: `plan` refuses
those (`publish-off-main`, `not-main-tip`), and writes `mode` only when it passes; on a re-run that
reuses an old plan, `ready` refuses it (`plan-stale`).

**Things to know when adopting the route (or moving to a newer pin of it).**

- The build's Node is the major the settings name, at the minor `actions/setup-node` v7.1.0 finds when the
  job runs: the runner image's cached 22.x when it has one, not always the newest (it looks for a
  newer one only when asked with `check-latest`). So a rebuild weeks later may not be byte-equal to
  the first (a minor can change Node's zlib). It matters for `recover` and for the dry run's compare
  with npm.
- Tags and releases made with the job's token start no `push: tags` or `release` workflow in the
  package's repository (GitHub starts no workflow from an event its job token made).
- The caller's concurrency group keeps one running and one pending run: a newer queued run cancels a
  PENDING run of the same group. The group is per kind of run (W11), so a dry run never cancels a
  waiting release, and among runs that may publish the newest plans the tip.
- A publish that was held still lets `verify` run (it runs after a failed publish, W7): it waits its
  bounded time and ends `registry-late`: red for the right reason (nothing was published), with a
  misleading name.
- The package's current version must have its published GitHub release before the move: otherwise
  the first push after it (the move itself, or anything that keeps the version) is refused
  `tag-elsewhere` (rule `finish-tag-elsewhere`) until the release is written by hand.

**Artifacts.**

| Artifact | Written by | Read by | Kept | Why |
|---|---|---|---|---|
| `release-route-package` | build | publish, verify | 30 days | the one file that crosses jobs. Its name has no attempt number, so "Re-run failed jobs" (which does not run a green build again) finds the file the first attempt's build uploaded: measured on storydeck run 43334890647, attempt 2. 30 days, as design section 4 says: a recover whose rebuild differs from npm is answered by re-running the ORIGINAL run's failed jobs, which still hold the published bytes, as long as nobody pressed "Re-run all jobs" on that run (below) |
| `release-route-plan-record-<attempt>` | plan | nobody (people, `why`) | 90 days | the plan's record. Its name has the attempt number: no job reads it, and a re-run of a failed job must be able to upload its own record beside the one an earlier attempt kept |
| `release-route-verify-record-<attempt>` | verify | nobody (people, `why`) | 90 days | the same, for verify: a `registry-late` verify re-run later must be able to keep its record |

**What "Re-run all jobs" does to them** (measured on storydeck run 43334890647, attempt 3, and read
back by the second reader with `gh api repos/footprintjs/storydeck/actions/artifacts/<id>`): the new
attempt's build uploaded `release-route-package` again with NO error (a new artifact id), that
attempt's jobs read the new file, and GitHub then answered 404 for every artifact of the earlier
attempts: the first package and the earlier records. Nothing wrong reaches npm or a tag that way: a
full re-run plans again from fresh facts (the tip of `main` measured, npm and the tag asked), `ready`
never publishes a version npm has, and verify refuses any package that differs from what npm
serves. What is lost is real: on a run that has published, "Re-run all jobs" deletes the only kept
copy of the bytes npm received and that attempt's plan and verify records, so the 90-day record
promise holds only until someone presses it, and "Re-run failed jobs on the original run" no longer
works for that run. So: never "Re-run all jobs" after the build of a run was green; use "Re-run
failed jobs", or start a new run from `main`. Keeping the published package where a re-run cannot
remove it (for example attached to the GitHub release the route writes) is a later design; this
change keeps how artifacts are kept.

Anyone who can read the run can download the records. They hold what `RELEASE-ROUTE-CHART.md`, "The
record", promises: no token, no environment, no runner path. 90 days is the longest a public
repository keeps an artifact, the same as this repository's shadow records.

### `release-check.yml`: what would the route do with this pull request?

No input, `contents: read`, one job: the route's plan job with the action fixed to `dry-run` and no
outputs (`test/workflow/release-check.test.mjs` holds it equal to that job except for those).
Without a build, hold or secret it answers: a pull request that leaves a released version alone reads
"this commit is not the one released as this version ... nothing is compared with npm" (its merge commit is
never the tagged one); one that raises it reads "npm does not have x.y.z; a publish from the tip of main would publish it"; a version with no CHANGELOG
section, an invalid settings file, a private package, or a workflow file that pins the route at
another commit than this check's (`pins-differ`) is red with its named refusal. The record is
uploaded as `release-check-plan-record-<attempt>`.

A pull request from a fork runs it with a read-only token and no secret. The tool is checked out at the
workflow's own commit, never at the pull request's, so nothing the pull request changes in the package
(its `package.json`, CHANGELOG, settings) changes the code that checks it. What it does NOT stop: a pull
request that edits the caller's own workflow file changes what runs for that pull request, as for every
`pull_request` check (it can change the pin, or drop the check). `plan` refuses a tool commit that is not
on ci `main` (`tool-not-reviewed`), and a workflow file whose route pin is not the commit running
(`pins-differ`, which reads the pull request's workflow files as bounded, untrusted text: see "Who can
attack this"); both catch the mistake but not a deliberate change; the review of a change to the
caller's workflow file is the gate.

### The caller a package writes

<!-- caller -->
```yaml
# The release route for <package>. Every step lives in footprintjs/ci, pinned below by full commit.
# Keep this file's name, publish.yml, and its name line: npm's trusted publisher for the package is
# bound to the repository + publish.yml. How to release: footprintjs/ci docs/RELEASE-ROUTE.md.
name: Publish to npm

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      action:
        description: "dry-run = plan and build, publish nothing; compares with npm only when npm has this version and its tag names this commit or there is no tag. publish = release what main names."
        type: choice
        options: [dry-run, publish]
        default: dry-run

permissions: {}

concurrency:
  group: release-${{ github.ref }}-${{ github.event_name == 'push' && 'publish' || inputs.action }}
  cancel-in-progress: false

jobs:
  release:
    uses: footprintjs/ci/.github/workflows/release-route.yml@0000000000000000000000000000000000000000 # the reviewed ci commit
    permissions:
      contents: write
      id-token: write
      issues: read
      pull-requests: read
    with:
      action: ${{ github.event_name == 'push' && 'publish' || inputs.action }}
```
<!-- /caller -->

The caller grants the most any job needs; inside, every job asks for less (a called workflow can
only lower permissions). `id-token: write` must be in both files, as npm's trusted publishing asks.
The concurrency group is per ref and per kind of run (runs that may publish share one; a dry run has
its own) and never cancels a run in progress (W11). The pin is a real commit of ci `main`; `plan`
refuses one that is not (`tool-not-reviewed`), and the all-zero placeholder above is not a commit at
all.

The pull-request check, in the package's pull-request workflow, pinned to the SAME commit. `plan`
holds the two to it: every `uses:` line of the caller's workflow files that names
`release-route.yml` or `release-check.yml` must pin the commit running, else `pins-differ`, naming the
file and the pin (so moving the pin is one pull request that changes both lines):

```yaml
on:
  pull_request:
jobs:
  release-check:
    permissions:
      contents: read
    uses: footprintjs/ci/.github/workflows/release-check.yml@0000000000000000000000000000000000000000 # the same reviewed ci commit
```

### What a person does

**To release** (by hand until change notes and `prepare` exist):

1. In a pull request, raise `version` in `package.json` (and the lock file) and write that version's
   CHANGELOG section. The release check says "npm does not have x.y.z; a publish from the tip of main would
   publish it", or names what is missing.
2. Merge it. The push to `main` runs the route as `publish`: plan, hold, build, publish, verify, release.
3. Read the run: the plan's summary says what it decided and why; verify's says npm serves the built
   bytes; the release job writes tag `v<version>` and the GitHub release. The records are the run's
   artifacts (`node scripts/release-route-chart.mjs why <record>` reads one).

**To try without publishing:** Actions, "Publish to npm", "Run workflow", action `dry-run`, from any
branch. It plans, checks the hold, builds, and compares the rebuild with npm when npm has the
version and the commit is the one released as it (its tag names this commit), or npm has it with no
tag. At any later commit of a released version it builds and inspects and compares nothing, so a
changed README or `package.json` is not a red run. Nothing is published, tagged or released (the
run keeps its package for 30 days and its records for 90).

**When something fails** (design section 4, as it stands after the rulings):

| Case | What the route does | What a person does |
|---|---|---|
| Version merged, not published (build red, a hold, machine trouble) | nothing more; the version stays untagged and unpublished | machine trouble: "Re-run failed jobs" (safe: the publish job measures again). After the build has turned green, never "Re-run all jobs" on that run: it builds and uploads the package again and GitHub deletes every artifact of the earlier attempts, the package npm may already have received and the records among them (see "Artifacts"); nothing wrong reaches npm (a full re-run plans again, and verify refuses other bytes), but the evidence is gone. Use "Re-run failed jobs", or start a new run from `main`. A real failure: merge a fix WITHOUT a new version; that push publishes |
| A hold set after the merge | the publish job's hold step (directly before the publish) refuses. A hold stops a publish (and turns a dry run red at its hold job); `recover` and `finish` do not ask it, because they tag and release a version npm already serves (design question 6) | lift the hold (`docs/HOLD.md`), then "Re-run failed jobs". That is safe: the publish job measures again; if `main` moved on or a newer version was published meanwhile, `ready` refuses (`plan-stale`; this job publishes nothing). Then start a new run from `main` (a push, or a dispatch): its plan decides afresh |
| A merge into `main` while a release is running | that run's publish job measures again and refuses `plan-stale`: the commit it planned is no longer the tip. The run is red by design; verify, which also runs after a failed publish job, waits its bounded time and ends `registry-late` | nothing. The caller's concurrency group queues the new push behind this run, and the run of the new tip publishes (a docs-only merge too: that run plans the tip, and the version is still not on npm). Do not re-run the red one |
| npm accepted, verify red with `registry-differs` | stops; no tag, no release | investigate; never tag over a mismatch |
| npm shows the version late (`registry-late`) | verify red after its bounded wait; no tag | "Re-run failed jobs" later: verify compares again with the same run's package |
| Published, then the TAG failed (no tag was made) | the next run plans `recover`: rebuild, compare with npm, then tag and release | if the rebuild is not byte-equal, "Re-run failed jobs" on the ORIGINAL run (its package is kept 30 days) |
| Tagged, then the GitHub release failed (or the release was deleted by hand) | the plan sees the tag and the version on npm and no published GitHub release. While the tagged commit is still the tip of `main`, a run of `main` asked to publish (a dispatch of `publish`, or "Re-run all jobs" of the tagged commit's own push run; a new push always brings a newer commit) plans `finish`: the release job alone writes the release for the existing tag. Once `main` has moved past it, every later push that keeps the version is refused `tag-elsewhere` (rule `finish-tag-elsewhere`), red until the release exists | write the release for that tag by hand ("Writing the release by hand", above), or, if the release job of the run that made the tag failed, use "Re-run failed jobs" on that run while GitHub still allows it (not once someone has pressed "Re-run all jobs" on that run after main moved on: that attempt plans `finish-not-tip`, ends green, and leaves no failed job to re-run; then write the release by hand; while it is allowed, `tag` answers skip for the tag, create for the release); or, while the tagged commit is the tip, a dispatch of `publish` |
| A run of an older commit of `main` finds its version on npm with no tag | refused, `release-unfinished` | "Re-run failed jobs" on the run that published it, or write the tag at that commit by hand |
| Tag exists, npm does not have the version | refused, `tag-without-package` | decide by hand (delete the stray tag, or raise the version) |
| Package unknown on npm | refused, `package-unknown` | the first publish of a new name is by hand (npm requires it) |
| "Re-run failed jobs", any time | the old plan is reused, so the publish job measures again: `ready` publishes only while the commit is the tip of `main` and the version the newest (else `plan-stale`), and skips the publish when npm has the same bytes; `tag` skips a tag at the same commit and refuses one elsewhere; a release that exists is skipped. NOT measured again: the plan's `latest`, so a release job re-run after a newer version was released still marks this release "Latest" if the plan said so | look at the releases page after such a re-run |

### Checked here

The two files parse (by the strict YAML subset the tests read with, which agrees with Ruby's YAML
parser on both files where Ruby is installed, and refuses what YAML would read differently) and keep
W1 to W14 as listed above. This repository's check has no workflow linter (no `actionlint`), and none
is downloaded by this change.

### The first runs: what they proved, and what only a real run can still show

The route first ran on GitHub on 13 November 2026, through its first caller (storydeck), and made one
real release (footprint-storydeck 0.13.2). The runs, each with what it showed, are in the review
exchange (`reviews/ci-release-route-first-real-runs-20261113.md`); storydeck runs 43331791589 and
43336217524 (pull-request checks), 43334890647 (a dry run, three attempts), 43336400518 (a dry run)
and 43338729924 (the release).

**Proved there:**

- `job.workflow_sha` is filled with the pinned commit in every job of the called workflow: the guard
  step is green, and the tool checkout shows that commit.
- `./tool/.github/actions/hold` resolves (the hold job's action path ends in `./tool/.github/actions/hold`),
  and the hold check read the caller's repository and passed with no label present.
- The build job: the vendored npm 11.19.0 unpacked with digests equal to the manifest, `npm ci`, the
  four checks, 81 files packed, the archive check passed with storydeck's `archive` list.
- `release-route-package` crosses jobs (build to verify, and on the release build to publish), its
  digest checked on download.
- Across attempts (run 43334890647): "Re-run failed jobs" (attempt 2) made verify read the package of
  the attempt that built it; "Re-run all jobs" (attempt 3) let the build upload the same name again
  with no error (no 409 Conflict), that attempt's jobs read the new file, and every artifact of the
  earlier attempts was gone afterwards (see "Artifacts").
- Two builds of the same commit on GitHub gave the same integrity: the build is reproducible there.
- A manual dispatch on a branch is accepted although the default branch's `publish.yml` had no
  dispatch trigger yet (GitHub reads the trigger from the branch's file); the caller's concurrency
  group per kind of run is accepted (run 43336400518).
- The plan's `git ls-remote` on the caller's `origin`, with no credentials kept, answered for a
  public repository (every plan above read the tag and the tip of `main`).
- The release (run 43338729924): the OIDC publish with the vendored npm and provenance from the
  CALLED workflow, npm accepting the caller's `publish.yml` as the trusted publisher; `ready` and
  verify as designed; the tag POST and `gh release create` with the job's token (storydeck has no
  tag ruleset); GitHub marked the release "Latest". The route titles a release `v<version> —
  <title>`, which differs from that repository's earlier hand-made releases (`<version> — <title>`).

**Still open, for a later real run:**

- A release made beside an existing draft with the same tag.
- Whether a job that reaches `timeout-minutes` reads as `cancelled` or `failure`, and whether a
  timed-out verify still uploads its record.
- What GitHub marks as "Latest" when an older version is released after a newer one. The REST page
  for "Create a release" says `make_latest` defaults to `true`; the release step now passes
  `--latest` only for the newest version npm has and `--latest=false` otherwise, and the first
  recover or finish of an older version is where that is seen.
- What `actions/checkout` writes to git config (W2), read from the plan job's checkout log.
- The tag POST under a tag ruleset (a caller that has one).
- What this change adds: the actions pinned at their Node 24 releases (checkout v7.0.1, setup-node
  v7.1.0, upload-artifact v7.0.2, download-artifact v8.0.2) run with no Node 20 warning and the
  package crosses jobs as before; a `finish` run writes only the release; `pins-differ` on a real
  pull request that moves one pin; a dry run of a released version at a later commit ends green
  with `compare=no`.

## Not built yet

Change notes, `prepare`, the bot, the linting of the caller's workflow file in `release-check.yml`
beyond the one pin rule (`pins-differ`), keeping the published package where a re-run cannot remove
it, the `npm` environment of design section 8, and any change in another repository. Prereleases are
refused (`version-not-plain`).
