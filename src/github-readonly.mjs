import {isOpaqueCredential} from './http-credential.cjs';
import { createHash } from 'node:crypto';

const REPO = '/repos/footprintjs/foottrace';
const SHA = '[a-f0-9]{40}';
const ROUTES = [
  /^\/repos\/footprintjs\/foottrace$/,
  new RegExp(`^${REPO}/git/ref/(?:heads/main|tags/v\\d+\\.\\d+\\.\\d+)$`),
  new RegExp(`^${REPO}/git/(?:commits|trees|blobs|tags)/${SHA}$`),
  new RegExp(`^${REPO}/commits/${SHA}/pulls$`),
  new RegExp(`^${REPO}/compare/${SHA}\\.\\.\\.${SHA}$`),
  new RegExp(`^${REPO}/pulls/[1-9]\\d*(?:/reviews|/commits)?$`),
  new RegExp(`^${REPO}/releases/(?:tags/v\\d+\\.\\d+\\.\\d+|[1-9]\\d*/assets|assets/[1-9]\\d*)$`),
  new RegExp(`^${REPO}/contents/(?:package\\.json|package-lock\\.json|CHANGELOG\\.md|README\\.md|docs/metadata\\.md)$`),
  /^\/users\/[a-z0-9-]+(?:%5Bbot%5D|\[bot\])$/i,
];
function refuse(code) { const error = new Error(code); error.code = code; throw error; }
function target(input, redirect = false) {
  if (typeof input !== 'string' || input.length > 8192) refuse('readonly-route');
  let url;
  try { url = new URL(input); } catch { refuse('readonly-route'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) refuse('readonly-route');
  if (redirect && url.hostname === 'release-assets.githubusercontent.com' &&
      /^\/github-production-release-asset\/[0-9]+\/[a-f0-9-]+$/.test(url.pathname)) return url;
  if (url.hostname === 'api.github.com') {
    if (!ROUTES.some((rule) => rule.test(url.pathname))) refuse('readonly-route');
    for (const [key, value] of url.searchParams) {
      if (!((key === 'ref' && new RegExp(`^${SHA}$`).test(value)) ||
        (key === 'recursive' && value === '1') || (key === 'per_page' && value === '100') ||
        (key === 'page' && /^[1-9]\d?$/.test(value)))) refuse('readonly-route');
      if (url.searchParams.getAll(key).length !== 1) refuse('readonly-route');
    }
    return url;
  }
  if (url.hostname === 'registry.npmjs.org' && !url.search &&
      /^\/foottrace\/(?:latest|\d+\.\d+\.\d+|-\/foottrace-\d+\.\d+\.\d+\.tgz)$/.test(url.pathname)) return url;
  refuse('readonly-route');
}

// No environment or candidate config is read. An optional existing read token is
// confined to GitHub API GETs; redirects and registry requests never receive it.
export function createReadOnlyTransport({ fetcher = globalThis.fetch, maxRequests = 4096, githubToken,
  maxBytes = 128 * 1024 * 1024, maxResponseBytes = 24 * 1024 * 1024 } = {}) {
  if (githubToken !== undefined && !isOpaqueCredential(githubToken)) refuse('readonly-credentials');
  let requests = 0, bytesRead = 0;
  const observations = [];
  const readonlyFetch = async (input, options = {}) => {
    if ((options.method ?? 'GET') !== 'GET' || options.body !== undefined) refuse('readonly-method');
    let headers;
    try { headers = new Headers(options.headers); } catch { refuse('readonly-headers'); }
    for (const [key, value] of headers) {
      if (key !== 'accept' || !['application/vnd.github+json', 'application/octet-stream'].includes(value)) refuse('readonly-headers');
    }
    let url = target(input);
    for (let redirects = 0; ; redirects++) {
      if (++requests > maxRequests) refuse('readonly-request-limit');
      let response;
      try { response = await fetcher(url.href, { method: 'GET', redirect: 'manual',
        headers: { accept: url.hostname === 'registry.npmjs.org' ?
            (url.pathname.endsWith('.tgz') ? 'application/octet-stream' : 'application/json') :
            (headers.get('accept') ?? 'application/vnd.github+json'),
          ...(url.hostname === 'api.github.com' ? { 'x-github-api-version': '2022-11-28',
            ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}) } : {}) },
        signal: AbortSignal.timeout(30000) }); } catch { refuse('readonly-transport'); }
      if (!response || !Number.isInteger(response.status)) refuse('readonly-response');
      if (response.status >= 300 && response.status < 400) {
        if (redirects >= 2 || url.hostname !== 'api.github.com' ||
            !new RegExp(`^${REPO}/releases/assets/[1-9]\\d*$`).test(url.pathname)) refuse('readonly-redirect');
        const next = target(response.headers.get('location'), true);
        if (next.hostname !== 'release-assets.githubusercontent.com') refuse('readonly-redirect');
        try { await response.body?.cancel(); } catch { refuse('readonly-body'); }
        url = next;
        continue;
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxResponseBytes)) refuse('readonly-response-limit');
      const reader = response.body?.getReader();
      let size = 0;
      const chunks = [];
      if (reader) {
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength; bytesRead += next.value.byteLength;
            if (size > maxResponseBytes || bytesRead > maxBytes) { await reader.cancel(); refuse('readonly-response-limit'); }
            chunks.push(Buffer.from(next.value));
          }
        } catch (error) { if (error?.code === 'readonly-response-limit') throw error; refuse('readonly-body'); }
      }
      const bytes = Buffer.concat(chunks);
      observations.push({ host: url.hostname, status: response.status, bytes: size,
        sha256: createHash('sha256').update(bytes).digest('hex') });
      return new Response(bytes, { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream' } });
    }
  };
  const api = async (method, route, body) => {
    if (method !== 'GET' || (body !== undefined &&
        (Object.keys(body).length !== 1 || body.accept !== 'application/octet-stream'))) refuse('readonly-method');
    if (typeof route !== 'string' || !route.startsWith('/')) refuse('readonly-route');
    const response = await readonlyFetch(`https://api.github.com${route}`, { method, headers: { accept: body?.accept ?? 'application/vnd.github+json' } });
    if (!response.ok) {
      const error = new Error('readonly-http');
      error.code = response.status === 404 ? 'github-http-not-found' : 'readonly-http';
      error.status = response.status; throw error;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (body?.accept === 'application/octet-stream') return { data: bytes };
    try { return { data: JSON.parse(bytes.toString('utf8')) }; } catch { refuse('readonly-json'); }
  };
  return Object.freeze({ api, fetcher: readonlyFetch, observations: () => observations.map((item) => ({ ...item })),
    totals: () => ({ requests, bytes: bytesRead }) });
}
