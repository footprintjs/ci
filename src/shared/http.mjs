// The ONE bounded GET of this repository's release tools (the hold check and the release route),
// through an injected fetch. It knows nothing about either feature: a failure is an HttpFailure
// with a `kind`, and each caller words it in its own vocabulary.
//
// - GET only, https only, no user or password in the URL; the CALLER names the host.
// - A redirect is never followed: `redirect: 'manual'` hands the 3xx back as kind 'redirect',
//   so a header can never travel to a host the caller did not name.
// - One timer covers the request AND the body, and it is a timer this module holds:
//   AbortSignal.timeout's timer does not keep Node alive (on Node 22 a stalled request with no
//   open socket let the process end before the timeout fired). The fetch promise itself is raced
//   against the timer, so a fetch that ignores its signal still ends at the bound.
// - The body is read in chunks and abandoned the moment it passes its bound; a Content-Length
//   over the bound is refused before reading.
// - No message carries a header value, so a token cannot reach a log through here.
//
//   const { status, bytes } = await boundedGet({ fetcher: fetch, url, headers, maxBytes: 1 << 20, timeoutMs: 30_000 });

export const KINDS = Object.freeze(['url', 'request', 'network', 'timeout', 'no-response', 'redirect', 'too-large', 'body']);

export class HttpFailure extends Error {
  constructor(kind, host = '', status = undefined) {
    super(`http ${kind}`);
    this.name = 'HttpFailure';
    this.kind = kind;
    this.host = host;
    this.status = status;
  }
}

const timeoutError = () => Object.assign(new Error('timeout'), { name: 'TimeoutError' });

export async function boundedGet({ fetcher, url, headers = {}, maxBytes, timeoutMs }) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new HttpFailure('url'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new HttpFailure('url');
  if (typeof fetcher !== 'function' || !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new HttpFailure('request', parsed.host);
  const host = parsed.host;
  const controller = new AbortController();
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(timeoutError()); reject(timeoutError()); }, timeoutMs);
  });
  timedOut.catch(() => {});
  try {
    let response;
    try {
      response = await Promise.race([fetcher(parsed.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers }), timedOut]);
    } catch (error) {
      throw new HttpFailure(error?.name === 'TimeoutError' || controller.signal.aborted ? 'timeout' : 'network', host);
    }
    const status = response?.status;
    if (!Number.isInteger(status)) throw new HttpFailure('no-response', host);
    if (status >= 300 && status < 400) throw new HttpFailure('redirect', host, status);
    const length = Number(response.headers?.get?.('content-length'));
    if (Number.isFinite(length) && length > maxBytes) throw new HttpFailure('too-large', host, status);
    return { status, bytes: await readBody(response, maxBytes, host, timedOut, controller.signal) };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function readBody(response, maxBytes, host, timedOut, signal) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    // Not a stream (a hand-made answer): it may still offer text(), bounded the same way.
    if (typeof response.text !== 'function') throw new HttpFailure('body', host);
    let text;
    try { text = await Promise.race([response.text(), timedOut]); } catch (error) {
      throw new HttpFailure(error?.name === 'TimeoutError' || signal.aborted ? 'timeout' : 'body', host);
    }
    const bytes = Buffer.from(String(text));
    if (bytes.length > maxBytes) throw new HttpFailure('too-large', host);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new HttpFailure('too-large', host);
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof HttpFailure) throw error;
    throw new HttpFailure(error?.name === 'TimeoutError' || signal.aborted ? 'timeout' : 'body', host);
  }
  return Buffer.concat(chunks);
}
