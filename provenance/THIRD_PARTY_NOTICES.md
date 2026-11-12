# Third-party inputs

- FootPrint 10.7.1, MIT: `licenses/footprintjs-MIT.txt`. Published dependency pinned in package-lock.json and bundled into dist/release.cjs.
- Foottrace 1.10.0, MIT: `licenses/foottrace-MIT.txt`. Published dependency pinned in package-lock.json and bundled into dist/release.cjs.
- Foottrace release helpers and compatibility corpus at f55250adcbe9bbfdde75b6bc2c889bac791ca131, MIT: test/upstream/LICENSE; per-file hashes/adaptations in upstream.json. Historical workflows and runner are fixtures, not live entry points.
- FootPrint release archive inspector at 531160b2124c11e373338bb65584909a1496a1f8, MIT (`licenses/footprintjs-MIT.txt`, the same project): the release route's ONE archive inspector under src/release-route/archive/ with its tests and attack corpus under test/release-route/archive/; per-file hashes and adaptations in release-route-archive.json.
- npm CLI 11.19.0, Artistic-2.0, with bundled dependency notices/licenses in vendor/npm/npm-11.19.0.tgz. Immutable source and integrity in vendor/npm/manifest.json. Preserved compressed; not extracted, executed or bound to the shadow CLI.
- esbuild 0.28.0, MIT: build-time only, package-lock.json. Its executable is not a runtime dependency of dist/release.cjs.

The generated bundle preserves legal comments. This list does not assert cryptographic verification of registry provenance attestations.
