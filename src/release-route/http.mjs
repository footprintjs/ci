// The release route's words for the one bounded GET (src/shared/http.mjs): every way a request
// can fail becomes a named refusal, and answers are read with the strict JSON reader. The rules
// of the request itself (https only, redirects refused, a held timer, a streaming byte bound)
// live in the shared module, which the hold check uses too.
import { boundedGet as sharedGet, HttpFailure } from '../shared/http.mjs';
import strictJson from './archive/strict-json.cjs';
import { refuse } from './refusals.mjs';

export const REQUEST_TIMEOUT_MS = 30_000;

const WORDS = Object.freeze({
  url: (f) => ['input-invalid', 'url'],
  request: (f) => ['input-invalid', 'request'],
  network: (f) => ['request-failed', `${f.host} network error`],
  timeout: (f) => ['request-failed', `${f.host} timeout`],
  'no-response': (f) => ['request-failed', `${f.host} no usable response`],
  body: (f) => ['request-failed', `${f.host} body not read`],
  redirect: (f) => ['response-redirect', `${f.host} HTTP ${f.status}`],
  'too-large': (f) => ['response-too-large', f.host],
});

export async function boundedGet({ fetcher, url, headers = {}, maxBytes, timeoutMs = REQUEST_TIMEOUT_MS }) {
  try {
    return await sharedGet({ fetcher, url, headers, maxBytes, timeoutMs });
  } catch (error) {
    if (error instanceof HttpFailure && Object.hasOwn(WORDS, error.kind)) refuse(...WORDS[error.kind](error));
    throw error;
  }
}

// Strict JSON (duplicate keys refused) with the given bounds, as a network answer.
export function answerJson(bytes, { maxBytes, maxValues }, host) {
  try {
    return strictJson.parseStrictJson(bytes, { maxBytes, maxValues });
  } catch {
    refuse('response-not-json', host);
  }
}
