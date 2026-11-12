// The ONE request of the hold check: a GET to the GitHub REST API with the job's read-only
// token, through the repository's one bounded GET (src/shared/http.mjs). The token goes into
// one header, to the one fixed host (src/shared/github.mjs: https://api.github.com;
// GITHUB_API_URL is not read), and into nothing else: no error message below ever includes it,
// and a redirect is an error (a redirect would carry the header somewhere the workflow never
// named). The words a person reads for each failure are the hold check's own, below.
import { GITHUB_API, githubHeaders, isToken } from '../shared/github.mjs';
import { boundedGet, HttpFailure } from '../shared/http.mjs';

const MAX_BYTES = 8 * 1024 * 1024;

const failureWords = (failure) => ({
  network: 'the request failed or timed out (network error)',
  timeout: 'the request failed or timed out (timeout)',
  'no-response': 'GitHub gave no usable response',
  redirect: `GitHub answered HTTP ${failure.status}`,
  'too-large': 'the answer is larger than the bound',
  body: 'the answer could not be read',
}[failure.kind] ?? 'the request could not be made');

export function createRequest({ fetcher, token, timeoutMs = 20000 }) {
  if (typeof fetcher !== 'function') throw new Error('no way to make a request');
  if (!isToken(token)) throw new Error('GH_TOKEN is missing or malformed');

  // path starts with "/repos/", already fixed by the caller; returns the parsed JSON.
  return async function get(path) {
    let answer;
    try {
      answer = await boundedGet({ fetcher, url: `${GITHUB_API}${path}`, headers: githubHeaders(token), maxBytes: MAX_BYTES, timeoutMs });
    } catch (error) {
      throw new Error(error instanceof HttpFailure ? failureWords(error) : 'the request could not be made');
    }
    if (answer.status < 200 || answer.status > 299) {
      const limited = answer.status === 429 || answer.status === 403 ? ', possibly rate-limited or not permitted' : '';
      throw new Error(`GitHub answered HTTP ${answer.status}${limited}`);
    }
    try { return JSON.parse(answer.bytes.toString('utf8')); } catch { throw new Error('the answer is not JSON'); }
  };
}
