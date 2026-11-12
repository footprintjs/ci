import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const npmPayload = await readFile('vendor/npm/npm-11.19.0.tgz');
const npmManifestBytes = await readFile('vendor/npm/manifest.json');
const npmManifest = JSON.parse(npmManifestBytes);
const npmDigest = createHash('sha256').update(npmPayload).digest('hex');
if (npmManifest.name !== 'npm' || npmManifest.version !== '11.19.0' || npmManifest.sha256 !== npmDigest) throw new Error('publisher-vendor-integrity');
const result = await build({ entryPoints: ['bin/release.mjs'], bundle: true, platform: 'node', target: 'node22',
  format: 'cjs', outfile: 'dist/release.cjs', write: false, metafile: true, legalComments: 'eof',
  logLevel: 'silent' });
// The committed executable has no runtime module resolution into the candidate.
let bytes = result.outputFiles[0].contents;
await mkdir('dist', { recursive: true });
await writeFile('dist/release.cjs', bytes, { mode: 0o755 });
const inputs = Object.entries(result.metafile.inputs).map(([path, value]) => ({ path, bytes: value.bytes })).sort((a,b) => a.path.localeCompare(b.path));
const external = Object.values(result.metafile.outputs).flatMap((value) => value.imports).filter((value) => value.external).map((value) => value.path);
if (external.some((value) => !value.startsWith('node:'))) throw new Error('bundle-external-dependency');
await writeFile('dist/build-metadata.json', JSON.stringify({ schemaVersion: 1, format: 'cjs', target: 'node22',
  sha256: createHash('sha256').update(bytes).digest('hex'), inputs, publisherPayload: { path: 'vendor/npm/npm-11.19.0.tgz', version: '11.19.0', sha256: npmDigest, bytes: npmPayload.length, boundToShadow: false }, external: [...new Set(external)].sort() }, null, 2) + '\n');

// The release route's charted steps (plan, verify, why): their own bundle, with the same checks —
// no runtime module resolution, no external import but node:, digests recorded. The workflow runs
// it from a plain checkout with nothing installed; CI rebuilds and compares it with the commit.
const route = await build({ entryPoints: ['bin/release-route.mjs'], bundle: true, platform: 'node', target: 'node22',
  format: 'cjs', outfile: 'dist/release-route.cjs', write: false, metafile: true, legalComments: 'eof', logLevel: 'silent' });
const routeBytes = route.outputFiles[0].contents;
const routeExternal = Object.values(route.metafile.outputs).flatMap((value) => value.imports).filter((value) => value.external).map((value) => value.path);
if (routeExternal.some((value) => !value.startsWith('node:'))) throw new Error('bundle-external-dependency');
await writeFile('dist/release-route.cjs', routeBytes, { mode: 0o755 });
const routeInputs = Object.entries(route.metafile.inputs).map(([path, value]) => ({ path, bytes: value.bytes })).sort((a, b) => a.path.localeCompare(b.path));
const versionOf = async (name) => JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version;
await writeFile('dist/release-route-metadata.json', JSON.stringify({ schemaVersion: 1, format: 'cjs', target: 'node22', entry: 'bin/release-route.mjs',
  sha256: createHash('sha256').update(routeBytes).digest('hex'), bytes: routeBytes.length,
  libraries: { footprintjs: await versionOf('footprintjs'), foottrace: await versionOf('foottrace') },
  inputs: routeInputs, external: [...new Set(routeExternal)].sort() }, null, 2) + '\n');
