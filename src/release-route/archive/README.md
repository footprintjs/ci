# Inspected release archive

The release route's ONE archive inspector, copied from footPrint
`scripts/publish-release/archive/` at `531160b2124c11e373338bb65584909a1496a1f8`
(per-file hashes: `provenance/release-route-archive.json`). The route changes only
what it needs, all visible in the commit after the copy:

- The package name is the source manifest's, never written in; the allowed members
  come from the repository's `archive` setting (`allowed.cjs`, the one owner of that
  rule; `docs/RELEASE-ROUTE.md` defines it) instead of `package/dist/` + `AGENTS.md`.
- `check-archive.cjs` is the port: `checkArchive(intake, sourceBytes, version, archive)`.
  The release-candidate operation and its CLI are gone (prereleases are a later phase).
- Named refusals where the copy said `invalid-archive`: `archive-path:<member>`,
  `archive-missing:<entry>`, `archive-version`, `archive-publish-config`, and
  `archive-intake` / `archive-file` / `publish-directory` for the files around it.
- What the port refuses that the original did not need to (its list was closed, so it never met
  these): see "Names no archive may hold" below.
- `strict-json.cjs` exports `parseStrictJson(bytes, { maxBytes, maxValues })`, so the
  route reads every JSON (settings, npm's and GitHub's answers) with this one reader.
- Tests live in `test/release-route/archive/`; `PROVENANCE.json` below is footPrint's
  record of ITS copy from foottrace and is kept unchanged as history.

This folder admits the exact tarball submitted to npm. It never extracts a
package, runs package code, installs a dependency or publishes a folder.

`inspector.cjs` exports:

- `inspectArchive(bytes, { package, version, sourceManifest })`: requires the
  admitted source manifest and returns package identity, archive hashes and the
  inspected file list. The caller publishes these same bytes by absolute path.
- `parseManifest(bytes)`: reads source or packed JSON with a 1 MiB input bound,
  depth 64 and 100,000 values. Both roots are objects; decoded duplicate keys at
  every depth refuse. Root callers use this before passing sourceManifest.
- `archiveRefusalCode(error)`: returns a fixed refusal code, optionally a known
  manifest field or a short SHA-256 key label. Raw unknown/control keys and
  manifest values never enter the diagnostic.

The archive profile is copied from `footprintjs/foottrace` at
`bb3c18244655b794d7c3660b0c35f2a510b45ea0`,
`scripts/release-archive.cjs`. `PROVENANCE.json` pins its full file hash and the
unchanged parser units. The gzip, closed tar header, checksums, padding, single
member, path, regular-file and finite resource rules remain that copy. The allowed
members are `package/package.json`, `package/README.md`, `package/LICENSE` and what
the `archive` setting lists. PAX, GNU extensions, long/non-ASCII paths and links
remain refused.

The unused ZIP reader was removed. The manifest comparison is the same typed
canonical whole-source comparison except `version`, with JSON object admission
made explicit. The source manifest is mandatory. Strict structural JSON
admission closes the copied reader's duplicate-key gap. The entire tar inventory
passes before packed JSON is read, so sibling `.npmrc`, `binding.gyp` and
`server.js` files refuse independently of manifest contents.

Adjacent `node:test` cases use the full current source manifest for positives,
changing only the planned version. Historical Claude archives are pinned inert
data under `fixtures/`; no member is extracted or executed. Their old minimal
baselines are not current positive fixtures. Structural corpus cases must fail
at archive admission, rather than borrowing an unrelated source mismatch.

`npm test` runs `test/release-route/archive/*.test.cjs` with the route's tests. Hosted exact-head checks, actual npm-pack profile
proof and Claude review remain separate gates.

## Names no archive may hold

The original admitted a closed list of names. Once the allowed names became a setting, these are
refused whatever the setting says, because each one makes a consumer's install do something the
package.json the route compared does not say, or makes some file system resolve the name to a
different file than the one written. Owner: `allowed.cjs` (what npm gives a meaning) and
`inspector.cjs · readTar` (what a file system folds together).

Files npm gives a meaning of its own (`archive-denied`, any letter case):

| Name | Why |
|---|---|
| root `binding.gyp` | npm's default install script is `node-gyp rebuild`: code on every install |
| root `server.js` | npm's default start script is `node server.js` |
| root `npm-shrinkwrap.json` | npm installs the tree it pins instead of the declared ranges |
| any `.npmrc` | npm configuration: registry, scripts, credentials |
| any `node_modules` folder | dependency code shipped inside the package, around the declared dependencies |

Names a file system resolves to a different file (`archive-name`):

| Name | Why |
|---|---|
| two paths equal without letter case | macOS and Windows keep one of them: `Package.json` lands on `package.json` |
| a root member equal to `package.json` without case, other than the exact one | the same, at the one file the route compares |
| a segment ending in `.` or a space | Windows drops them: `binding.gyp.` becomes `binding.gyp` |
| `~` in a segment | Windows short names: `PACKAG~1.JSO` can resolve to an existing `package.json` (no family tarball uses `~`) |
| `:` in a segment | a drive letter or an alternate data stream on Windows: `package.json:x` |
| a Windows device base name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`, any case, any extension) | Windows opens the device, not a file |

Already refused by the copied profile (`invalid-archive` / `archive-profile`): `\` anywhere (a path
separator on Windows), `.` and `..` segments, empty segments, and any character outside printable
ASCII, which keeps Unicode look-alikes and normal forms out (`pаckage.json` with a Cyrillic `а`).

