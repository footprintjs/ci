// The route's ONE question to GitHub: is the release tool's commit on footprintjs/ci main?
//
// Why: a caller pins the route by full commit. A commit that is not on ci main was never
// reviewed there (and a commit pushed to a fork can be addressed through the parent
// repository), so the route refuses to release with it. The compare API answers in one call:
// for base `main` and head <sha>, "identical" or "behind" means the commit is an ancestor of
// main. Anything else, including a 404 for a commit GitHub does not know, is "not reviewed".
//
// The token, when given, goes in one header to this host only, and never into a message.
import { answerJson, boundedGet } from './http.mjs';
import { isCommit } from './identity.mjs';
import { refuse } from './refusals.mjs';

export const TOOL_REPOSITORY = 'footprintjs/ci';
const COMPARE = { maxBytes: 16 * 1024 * 1024, maxValues: 1_000_000 };
const TOKEN = /^[\x21-\x7e]{1,8192}$/;

// GITHUB_API_URL, or api.github.com: plain https, no user, query or fragment.
export function apiOrigin(apiUrl) {
  if (apiUrl === undefined || apiUrl === '') return 'https://api.github.com';
  let url;
  try { url = new URL(apiUrl); } catch { refuse('input-invalid', 'GITHUB_API_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) refuse('input-invalid', 'GITHUB_API_URL');
  return url.href.replace(/\/+$/, '');
}

export async function toolReviewed({ fetcher, sha, token, apiUrl }) {
  if (!isCommit(sha)) refuse('input-invalid', 'tool commit');
  const origin = apiOrigin(apiUrl);
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (token !== undefined && token !== '') {
    if (typeof token !== 'string' || !TOKEN.test(token)) refuse('input-invalid', 'GITHUB_TOKEN');
    headers.authorization = `Bearer ${token}`;
  }
  const { status, bytes } = await boundedGet({ fetcher, url: `${origin}/repos/${TOOL_REPOSITORY}/compare/main...${sha}?per_page=1`,
    headers, maxBytes: COMPARE.maxBytes });
  if (status === 404) return false;
  if (status !== 200) refuse('response-status', `GitHub HTTP ${status}`);
  const answer = answerJson(bytes, COMPARE, new URL(origin).host);
  const base = answer.merge_base_commit;
  if (typeof answer.status !== 'string' || base === null || typeof base !== 'object' || typeof base.sha !== 'string')
    refuse('response-shape', 'GitHub compare');
  if (answer.status === 'identical' || answer.status === 'behind') return base.sha === sha;
  if (answer.status === 'ahead' || answer.status === 'diverged') return false;
  refuse('response-shape', 'GitHub compare status');
}
