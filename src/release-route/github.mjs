// The route's ONE question to GitHub: is the release tool's commit on footprintjs/ci main?
//
// What it is for: a caller pins the route by full commit, and pinning a commit that was never on
// ci main (a branch commit, a typo that happens to exist, a commit pushed to a fork and addressed
// through the parent repository) is an easy MISTAKE. This catches it. What it cannot do: stop a
// caller who pins unreviewed code on purpose, because that code is the code running this check
// and can simply leave it out. The real gates are ci main's own review and the review of the
// caller's pin.
//
// The compare API answers in one call: for base `main` and head <sha>, "identical" or "behind"
// with the commit as merge base means the commit is an ancestor of main. Anything else,
// including a 404 for a commit GitHub does not know, is "not reviewed".

import { GITHUB_API, githubHeaders, isToken } from '../shared/github.mjs';
import { answerJson, boundedGet } from './http.mjs';
import { isCommit } from './identity.mjs';
import { refuse } from './refusals.mjs';

export const TOOL_REPOSITORY = 'footprintjs/ci';
const COMPARE = { maxBytes: 16 * 1024 * 1024, maxValues: 1_000_000 };

// The token, when given, goes in one header to the fixed API host only (src/shared/github.mjs),
// never into a message. GITHUB_API_URL is not read.
export async function toolReviewed({ fetcher, sha, token }) {
  if (!isCommit(sha)) refuse('input-invalid', 'tool commit');
  if (token !== undefined && token !== '' && !isToken(token)) refuse('input-invalid', 'GITHUB_TOKEN');
  const { status, bytes } = await boundedGet({ fetcher, url: `${GITHUB_API}/repos/${TOOL_REPOSITORY}/compare/main...${sha}?per_page=1`,
    headers: githubHeaders(token || undefined), maxBytes: COMPARE.maxBytes });
  if (status === 404) return false;
  if (status !== 200) refuse('response-status', `GitHub HTTP ${status}`);
  const answer = answerJson(bytes, COMPARE, new URL(GITHUB_API).host);
  const base = answer.merge_base_commit;
  if (typeof answer.status !== 'string' || base === null || typeof base !== 'object' || typeof base.sha !== 'string')
    refuse('response-shape', 'GitHub compare');
  if (answer.status === 'identical' || answer.status === 'behind') return base.sha === sha;
  if (answer.status === 'ahead' || answer.status === 'diverged') return false;
  refuse('response-shape', 'GitHub compare status');
}
