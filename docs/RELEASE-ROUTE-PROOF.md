# The release route: proof

Part of [RELEASE-ROUTE.md](RELEASE-ROUTE.md).

Run on Node 24.21.0 and Node 22.16.0 (macOS), 12 Nov 2026, at this pull request's head.

- `npm run check` on Node 24.21.0: 1065 tests, 1065 pass, 0 fail, then the build; `npm run check`
  on Node 22.16.0: 1065 pass. `git diff --stat origin/main -- dist` is empty (these modules are not
  bundled into `dist/release.cjs`).
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
  differs from the source → `archive-version`. With `binding.gyp`, `.npmrc`, `server.js`,
  `node_modules/...` or `npm-shrinkwrap.json` added, under a setting widened with `*.js`, `*.gyp`,
  `*.json` and `*npmrc`: `archive-denied:<member>` each (`archive-family.test.mjs`). The second
  reader's `widen.mjs`: its widened settings `["dist/","*"]`, `["dist/","node_modules/"]`,
  `["dist/","binding.gyp"]`, `["dist/",".npmrc"]` are now refused, and its tarball is refused.
- **The plan against the family today**: footprint-storydeck `main` at
  `a3936e304d8670f7fcec40d227df1309a994d46c` (real `package.json` and `CHANGELOG.md` blobs, the
  author value made neutral), its tag and its tip of `main` from `git ls-remote` on github.com,
  npm's real package document and GitHub's real compare answer for a ci commit on `main`, all
  saved on 12 Nov 2026, plus the `.github/release.json` storydeck's first pull request will
  add: rule `released`, mode `nothing` (`observe.test.mjs`, `command.test.mjs`).
- **The command, live** (GitHub, npm and github.com read over the network, GET only; Node's
  fetch needed `NODE_USE_ENV_PROXY=1` in the sandbox used): with the settings file in a local
  commit that was never pushed, `plan` gives `released` → `nothing` and reads
  `commitIsMainTip=false` (the local commit is not origin's tip). `ready` on the published
  storydeck 0.13.1 tarball: "npm already serves ... with exactly these bytes", `publish=no`.
  `tag` for 0.13.1 at `c94c2a6` (the tagged commit): tag `skip`, release `skip`; at today's
  `main`: `tag-elsewhere`. `verify` of the published tarball passes; of another file,
  `registry-differs`. `npm-tool` unpacks the vendored npm and `node <dir>/package/bin/npm-cli.js
  --version` prints 11.19.0. `inspect` of the published 0.13.1 tarball against today's `main` is
  refused `manifest-source:devDependencies`: `main` changed `package.json` after 0.13.1 was
  published, so a reproducibility measurement must run at the release commit.
- **A red test for every refusal**: for each of the 61 codes the code raises (of 63), every
  quoted use of it in `src/release-route/` was replaced by `unexpected-failure` and the route's
  tests run again (a scratch script, not committed): every one of the 61 turned at least one
  test red, among them `archive-denied`, `archive-name`, `release-unfinished`, `tag-elsewhere`,
  `release-unexpected` and `npm-tool`.
  The other two (`unexpected-failure`, `unknown-refusal`) are what the table itself makes, pinned
  in `refusals.test.mjs`.
- **Round 2 of the second read, re-run:** its `twin.cjs` (a clean `package/package.json` beside
  `package/Package.json` with an install script, setting `*.json`) is refused
  `archive-name:package/Package.json`; its `lsremote.mjs` on a real origin: a branch
  `refs/tags/v1.5.0` and a tag `x/refs/tags/v1.6.0` read as no tag, `mainTip` with a branch
  `x/refs/heads/main` reads the real tip, a tag `v1.7.0` beside a branch `v1.7.0` reads the tag's
  commit, a tag of a tag peels to the commit. Its `deny2.mjs`: every case twin, trailing dot and
  trailing space is `archive-name`. Its `enum.mjs` over 3,188,646 combinations: no row unmatched;
  its four remaining "violations" are `not-main-tip` -> `nothing` with npm lacking the version,
  which is intended.
