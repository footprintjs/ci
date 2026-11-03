import { jsonData, fields, id, text } from '../eco/json-data.mjs';
import { bindProposalMetadata } from './proposal-metadata-payload.mjs';
const MiB = 1024 * 1024, HARD = Object.freeze({ requests: 4096, totalBytes: 128 * MiB });
const fail = () => { throw new Error('github-transport-unavailable'); };
function limits(input = HARD) {
  const value = fields(jsonData(input), ['requests', 'totalBytes']);
  for (const key of ['requests', 'totalBytes'])
    if (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > HARD[key]) fail();
  return value;
}
const counters = () => ({ fetchAttempts: 0, admittedBytes: 0, exhausted: false });
/** Credential-bearing requests stay on the declared GitHub API repository.
 * Exactly one documented artifact302 may acquire anonymous bytes from fixed
 * artifact infrastructure. No redirect URL/header/body/error is a public fact.
 * Bounds apply before buffering/JSON/archive admission; an overflowing stream
 * chunk is cancelled rather than copied. No absolute socket/heap guarantee is
 * inferred for a caller-supplied fetch implementation.
 */
export function createGitHubTransport({ repository, fetcher, limits: inputLimits } = {}) {
  const repo = fields(jsonData(repository), ['id', 'full_name']); id(repo.id);
  text(repo.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 201);
  if (typeof fetcher !== 'function') fail();
  const globalLimit = limits(inputLimits), global = counters(), controller = new AbortController(), prefix = '/repos/' + repo.full_name;
  // Ephemeral within this captured owner only; not a saved outcome or later-run grant.
  let patchAttempted = false;
  const facts = value => Object.freeze({ ...value });
  const makeView = (input, registry, patch = null) => {
    const bound = limits(input), local = counters();
    const exhausted = () => { global.exhausted = local.exhausted = true; controller.abort(new Error('github-transport-budget')); fail(); };
    const takeRequest = () => {
      if (global.exhausted || local.exhausted || global.fetchAttempts >= globalLimit.requests || local.fetchAttempts >= bound.requests) exhausted();
      global.fetchAttempts++; local.fetchAttempts++;
    };
    const admit = count => {
      if (global.exhausted || local.exhausted || global.admittedBytes + count > globalLimit.totalBytes ||
          local.admittedBytes + count > bound.totalBytes) return false;
      global.admittedBytes += count; local.admittedBytes += count; return true;
    };
    const invoke = async (url, options) => {
      options.signal.throwIfAborted(); takeRequest();
      const response = await fetcher(url, options);
      if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
          typeof response.ok !== 'boolean' || response.ok !== (response.status >= 200 && response.status < 300)) fail();
      return response;
    };
    const bounded = async (response, maximum, artifact) => {
      if (!response.ok) { await response.body?.cancel(); return new Response(null, { status: response.status }); }
      if (response.status !== 200) { await response.body?.cancel(); fail(); }
      const contentType = response.headers.get('content-type');
      if (artifact && !['application/zip', 'application/octet-stream'].includes(contentType?.split(';')[0].trim().toLowerCase())) {
        await response.body?.cancel(); fail();
      }
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum ||
          Number(declared) > globalLimit.totalBytes - global.admittedBytes || Number(declared) > bound.totalBytes - local.admittedBytes)) {
        await response.body?.cancel(); exhausted();
      }
      const chunks = [], reader = response.body?.getReader(); let size = 0;
      if (reader) try {
        for (;;) {
          const next = await reader.read(); if (next.done) break;
          if (!(next.value instanceof Uint8Array)) { await reader.cancel(); fail(); }
          size += next.value.byteLength;
          if (size > maximum || !admit(next.value.byteLength)) {
            await reader.cancel(); exhausted();
          }
          chunks.push(Buffer.from(next.value));
        }
      } finally { reader.releaseLock(); }
      return new Response(Buffer.concat(chunks), { status: 200, headers: { 'content-type': contentType ?? 'application/octet-stream' } });
    };
    const requestSignal = signal => {
      if (signal !== undefined && !(signal instanceof AbortSignal)) fail();
      return AbortSignal.any([AbortSignal.timeout(30000), controller.signal, ...(signal === undefined ? [] : [signal])]);
    };
    const fetchBounded = async (url, options = {}) => {
      try {
        if (typeof url !== 'string' || url.length > 8192) fail();
        if (patch) {
          if (url !== patch.url || options.method !== 'PATCH' || options.body !== patch.body || patchAttempted) fail();
          const signal = requestSignal(options.signal); signal.throwIfAborted();
          // Lock before awaiting fetch: another view cannot repeat an uncertain submission.
          patchAttempted = true;
          const response = await invoke(url, { ...options, method: 'PATCH', body: patch.body,
            credentials: 'omit', redirect: 'error', signal });
          if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail(); }
          if (response.ok) {
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
            if (!['application/json', 'application/vnd.github+json'].includes(type)) {
              await response.body?.cancel(); fail();
            }
          }
          return await bounded(response, 2 * MiB, false);
        }
        if (registry) {
          if (!registry.urls.has(url) || (options.method ?? 'GET') !== 'GET' || options.body !== undefined) fail();
          const signal = requestSignal(options.signal), tarball = url === registry.tarball;
          const response = await invoke(url, { method: 'GET', headers: { accept: tarball ? 'application/octet-stream' : 'application/json' },
            credentials: 'omit', redirect: 'error', signal });
          if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail(); }
          if (response.ok) {
            const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
            if (tarball ? !['application/octet-stream', 'application/gzip', 'application/x-gzip'].includes(type) : type !== 'application/json') {
              await response.body?.cancel(); fail();
            }
          }
          return await bounded(response, tarball ? 16 * MiB : 2 * MiB, false);
        }
        const target = new URL(url), path = target.pathname;
        if (target.origin !== 'https://api.github.com' || target.username || target.password || target.hash ||
            options.method !== 'GET' || options.body !== undefined || /%(?:2f|5c|25|00)/i.test(path) ||
            path.split('/').some(part => ['.', '..'].includes(decodeURIComponent(part))) ||
            !(path === prefix || path.startsWith(prefix + '/') || path === '/app' || path.startsWith('/users/'))) fail();
        const suffix = path.startsWith(prefix + '/') ? path.slice((prefix + '/').length) : '';
        const artifact = /^actions\/artifacts\/[1-9]\d*\/zip$/.test(suffix);
        const signal = requestSignal(options.signal);
        let response = await invoke(target.href, { ...options, signal, redirect: artifact ? 'manual' : 'error' });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location'); await response.body?.cancel();
          if (!artifact || response.status !== 302 || typeof location !== 'string' || location.length > 16384 || !location.startsWith('https://')) fail();
          const next = new URL(location);
          const host = /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(next.hostname) || next.hostname === 'results-receiver.actions.githubusercontent.com';
          if (!host || next.protocol !== 'https:' || next.username || next.password || next.port || next.hash) fail();
          response = await invoke(next.href, { method: 'GET', headers: { accept: 'application/zip' }, credentials: 'omit', signal, redirect: 'error' });
          if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); fail(); }
        }
        const maximum = artifact ? 20 * MiB : /^git\/blobs\/[a-f0-9]{40}$/.test(suffix) ? 4 * MiB : 2 * MiB;
        return await bounded(response, maximum, artifact);
      } catch { fail(); }
    };
    return Object.freeze({ fetch: fetchBounded, facts: () => facts(local) });
  };
  const createRegistryView = input => {
    const value = jsonData(input); fields(value, Object.hasOwn(value, 'limits') ? ['packageName', 'version', 'limits'] : ['packageName', 'version']);
    text(value.packageName, /^[a-z0-9][a-z0-9._-]*$/, 214);
    text(value.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[A-Za-z0-9.-]{1,64})?$/, 128);
    const base = 'https://registry.npmjs.org/' + value.packageName,
      tarball = base + '/-/' + value.packageName + '-' + value.version + '.tgz';
    return makeView(value.limits, { urls: new Set([base + '/' + value.version, base + '/latest', tarball]), tarball });
  };
  const createExactPatchView = input => {
    try {
      const value = jsonData(input, 128 * 1024);
      fields(value, Object.hasOwn(value, 'limits') ? ['pullNumber', 'desired', 'limits'] : ['pullNumber', 'desired']);
      id(value.pullNumber);
      const desired = bindProposalMetadata(value.desired, true);
      return makeView(value.limits, null, {
        url: 'https://api.github.com' + prefix + '/pulls/' + value.pullNumber,
        body: JSON.stringify({ title: desired.title, body: desired.body })
      });
    } catch { fail(); }
  };
  // Trusted internal IO only. These route/byte limits do not grant domain eligibility.
  // Read-only bundle exports never return this owner or its exact-PATCH view.
  return Object.freeze({ createView: input => makeView(input, null), createRegistryView,
    createExactPatchView, facts: () => facts(global) });

}
