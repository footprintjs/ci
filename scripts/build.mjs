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
