// The ONE way the route asks the network: a bounded GET through an injected fetch.
//
// - GET only, https only, no user or password in the URL; the CALLER names the host (npm's
//   registry, or GitHub's API) and checks it before calling.
// - A redirect is never followed: `redirect: 'manual'` hands the 3xx back and it is refused, so
//   a header can never travel to a host the route did not name.
// - One timeout covers the request AND the body; the body is read in chunks and abandoned the
//   moment it passes its bound (a Content-Length over the bound is refused before reading).
// - The answer is { status, bytes }; which statuses are acceptable is the caller's question.
// - Messages never include a header value, so a token cannot reach the log through here.
import { refuse } from './refusals.mjs';
import strictJson from './archive/strict-json.cjs';

export const REQUEST_TIMEOUT_MS = 30_000;

export async function boundedGet({ fetcher, url, headers = {}, maxBytes, timeoutMs = REQUEST_TIMEOUT_MS }) {
  let parsed;
  try { parsed = new URL(url); } catch { refuse('input-invalid', 'url'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) refuse('input-invalid', 'url');
  if (typeof fetcher !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1) refuse('input-invalid', 'request');
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetcher(parsed.href, { method: 'GET', redirect: 'manual', signal, headers });
  } catch (error) {
    refuse('request-failed', `${parsed.host} ${error?.name === 'TimeoutError' ? 'timeout' : 'network error'}`);
  }
  const status = response?.status;
  if (!Number.isInteger(status)) refuse('request-failed', `${parsed.host} no usable response`);
  if (status >= 300 && status < 400) refuse('response-redirect', `${parsed.host} HTTP ${status}`);
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes) refuse('response-too-large', parsed.host);
  return { status, bytes: await readBody(response, maxBytes, parsed.host, signal) };
}

async function readBody(response, maxBytes, host, signal) {
  if (!response.body || typeof response.body.getReader !== 'function') return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  // Each read races the timeout: a server that sends headers and then stalls must not hold
  // the job past the bound (a fetch does not always tie the body stream to its signal).
  const timedOut = new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  timedOut.catch(() => {});
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) refuse('response-too-large', host);
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error?.name === 'Refusal') throw error;
    refuse('request-failed', `${host} ${error?.name === 'TimeoutError' ? 'timeout' : 'body not read'}`);
  }
  return Buffer.concat(chunks);
}

// Strict JSON (duplicate keys refused) with the given bounds, as a network answer.
export function answerJson(bytes, { maxBytes, maxValues }, host) {
  try {
    return strictJson.parseStrictJson(bytes, { maxBytes, maxValues });
  } catch {
    refuse('response-not-json', host);
  }
}
