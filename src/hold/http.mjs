// The ONE request of the hold check: a GET to the GitHub REST API with the job's
// read-only token. The token goes into one header, to one host, and into nothing else:
// no error message below ever includes it, and a redirect is an error (a redirect
// would carry the header somewhere the workflow never named).
const TOKEN = /^[\x21-\x7e]{1,8192}$/;
const MAX_BYTES = 8 * 1024 * 1024;

export function createRequest({ fetcher, token, apiUrl = 'https://api.github.com', timeoutMs = 20000 }) {
  if (typeof fetcher !== 'function') throw new Error('no way to make a request');
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('GH_TOKEN is missing or malformed');
  let base;
  try { base = new URL(apiUrl); } catch { throw new Error('GITHUB_API_URL is not a URL'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('GITHUB_API_URL must be a plain https URL');
  const root = base.href.replace(/\/+$/, '');

  // path starts with "/repos/", already fixed by the caller; returns the parsed JSON.
  return async function get(path) {
    let response;
    try {
      response = await fetcher(`${root}${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${token}` } });
    } catch (error) {
      throw new Error(`the request failed or timed out (${error?.name === 'TimeoutError' ? 'timeout' : 'network error'})`);
    }
    if (!response || !Number.isInteger(response.status)) throw new Error('GitHub gave no usable response');
    if (response.status < 200 || response.status > 299) {
      const limited = response.status === 429 || response.status === 403 ? ', possibly rate-limited or not permitted' : '';
      throw new Error(`GitHub answered HTTP ${response.status}${limited}`);
    }
    let text;
    try { text = await response.text(); } catch { throw new Error('the answer could not be read'); }
    if (text.length > MAX_BYTES) throw new Error('the answer is larger than the bound');
    try { return JSON.parse(text); } catch { throw new Error('the answer is not JSON'); }
  };
}
