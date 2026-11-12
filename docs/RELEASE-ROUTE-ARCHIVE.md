# The release route's archive inspector

Part of [RELEASE-ROUTE.md](RELEASE-ROUTE.md).

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
| `inspector.cjs` | Allowed members from the `archive` setting (`allowed.cjs`) instead of `package/dist/` + `AGENTS.md`, with a fixed deny list no setting lifts; the package name only from the source manifest; named refusals `archive-path`, `archive-denied`, `archive-missing`, `archive-version`, `archive-publish-config` where the copy said `invalid-archive`. The gzip/tar walk is split out as `readTar` (exported as `readArchiveMembers`), so the vendored npm is unpacked by this same reader; it now also refuses every name some file system resolves to a different file (`archive-name`: case twins, a second `package.json`, a trailing `.` or space, `~`, `:`, Windows device names), which the original's closed list never needed to. |
| `allowed.cjs` | New: the one owner of the `archive` setting and of what no setting may allow. |
| `check-archive.cjs` | The port: `readIntake(intake)` (the one reader of a built tarball) and `checkArchive(intake, sourceBytes, version, archive)`; the package name is no longer written in; the release-candidate operation and the CLI are gone (prereleases are a later phase; `candidate-version.cjs` was not copied); refusals go through `refusal.cjs`. `preparePublishDirectory` is kept for the publish job. |
| `refusal.cjs` | A `{ text }` field prints a label the route bounded first (a member path that passed the closed tar profile, or `entry-<n>`); otherwise hashed as before. |
| `strict-json.cjs` | `parseStrictJson(bytes, { maxBytes, maxValues })`, so every JSON the route reads uses this reader (npm's document for agentfootprint is over 1 MiB). `parseManifest` keeps its bounds. |
| tests | Moved to `test/release-route/archive/`, with footPrint's `package.json` at the same commit as their source-manifest fixture; refusal patterns name the new codes. |

Unchanged: the gzip and closed tar profile, checksums, padding, one member per name, regular
files only, no PAX/GNU/long/non-ASCII paths, the whole-manifest comparison except `version`,
the refusal of `publishConfig`, the resource bounds (16 MiB compressed, 64 MiB expanded, 10,000
files).
