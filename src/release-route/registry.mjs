// Questions to npm's registry, and only to https://registry.npmjs.org, with no token ever:
// is the package known, which versions exist, one version's integrity and tarball address, and
// "does npm serve exactly these bytes". Every answer is strict JSON of an exact shape.
//
// Why two documents: the abbreviated document (Accept: application/vnd.npm.install-v1+json)
// lists every version in one answer (agentfootprint's is about 1 MiB today), and the one-version
// document (/<name>/<version>) is small and is what a just-published version shows first.
import { createHash } from 'node:crypto';
import archivePort from './archive/check-archive.cjs';
import { answerJson, boundedGet } from './http.mjs';
import { isPackageName, isPlainVersion } from './identity.mjs';
import { refuse } from './refusals.mjs';

export const REGISTRY_HOST = 'registry.npmjs.org';
const ORIGIN = `https://${REGISTRY_HOST}`;
const PACKUMENT = { maxBytes: 32 * 1024 * 1024, maxValues: 2_000_000 };
const VERSION_DOC = { maxBytes: 1024 * 1024, maxValues: 100_000 };
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
// The bounded wait for a version npm shows late: 20 looks, 15 seconds apart (about 5 minutes).
export const WAIT = Object.freeze({ tries: 20, delayMs: 15_000 });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const path = (name) => (name.startsWith('@') ? name.replace('/', '%2f') : name);

function checkName(name, version) {
  if (!isPackageName(name)) refuse('input-invalid', 'package');
  if (version !== undefined && !isPlainVersion(version)) refuse('input-invalid', 'version');
}

// The only tarball address the route accepts for name@version.
export function tarballUrl(name, version) {
  const base = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name;
  return `${ORIGIN}/${name}/-/${base}-${version}.tgz`;
}

export const integrityOf = (bytes) => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

// { known: false } on 404; { known: true, versions: [..] } otherwise.
export async function readVersions({ fetcher, name }) {
  checkName(name);
  const { status, bytes } = await boundedGet({ fetcher, url: `${ORIGIN}/${path(name)}`, maxBytes: PACKUMENT.maxBytes,
    headers: { accept: 'application/vnd.npm.install-v1+json' } });
  if (status === 404) return { known: false, versions: [] };
  if (status !== 200) refuse('response-status', `npm HTTP ${status}`);
  const doc = answerJson(bytes, PACKUMENT, REGISTRY_HOST);
  if (doc.name !== name || !isObject(doc.versions)) refuse('response-shape', 'npm package document');
  const versions = Object.keys(doc.versions);
  for (const version of versions)
    if (!isObject(doc.versions[version]) || doc.versions[version].version !== version) refuse('response-shape', 'npm versions');
  return { known: true, versions };
}

// { integrity, tarball } of name@version, or null while npm does not show it (404).
export async function readDist({ fetcher, name, version }) {
  checkName(name, version);
  const { status, bytes } = await boundedGet({ fetcher, url: `${ORIGIN}/${path(name)}/${version}`, maxBytes: VERSION_DOC.maxBytes,
    headers: { accept: 'application/json' } });
  if (status === 404) return null;
  if (status !== 200) refuse('response-status', `npm HTTP ${status}`);
  const doc = answerJson(bytes, VERSION_DOC, REGISTRY_HOST);
  const dist = doc.dist;
  if (doc.name !== name || doc.version !== version || !isObject(dist) || typeof dist.integrity !== 'string' ||
      !INTEGRITY.test(dist.integrity) || typeof dist.tarball !== 'string') refuse('response-shape', 'npm version document');
  if (dist.tarball !== tarballUrl(name, version)) refuse('tarball-url');
  return { integrity: dist.integrity, tarball: dist.tarball };
}

// Waits a bounded time for name@version to appear; `sleep(ms)` is injected.
export async function waitForDist({ fetcher, name, version, sleep, wait = WAIT }) {
  for (let attempt = 1; attempt <= wait.tries; attempt++) {
    const dist = await readDist({ fetcher, name, version });
    if (dist) return dist;
    if (attempt < wait.tries) await sleep(wait.delayMs);
  }
  refuse('registry-late', `${name}@${version}`);
}

// npm must serve exactly `localBytes` for name@version: its recorded integrity AND the bytes of
// the tarball it hands out are both compared with the local file.
export async function compareWithNpm({ fetcher, name, version, localBytes, sleep, wait = WAIT }) {
  const local = integrityOf(localBytes);
  const dist = await waitForDist({ fetcher, name, version, sleep, wait });
  if (dist.integrity !== local) refuse('registry-differs', 'integrity');
  const { status, bytes } = await boundedGet({ fetcher, url: dist.tarball, maxBytes: archivePort.MAX_ARCHIVE_BYTES,
    headers: { accept: 'application/octet-stream' } });
  if (status !== 200) refuse('response-status', `npm tarball HTTP ${status}`);
  if (integrityOf(bytes) !== local) refuse('registry-differs', 'tarball bytes');
  return { integrity: local, tarball: dist.tarball };
}
