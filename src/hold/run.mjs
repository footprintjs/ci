import { cannotCheck, decideHold, inputProblem } from './decide.mjs';
import { createRequest } from './http.mjs';
import { listHolds } from './list-holds.mjs';
import { readVersions } from './versions.mjs';

// The whole check with its two doors injected: `fetcher` (fetch-shaped) and `git`.
// Returns { code, lines }; the caller prints and exits. Every `catch` below FAILS:
// there is no path from an exception to "no hold".
export async function runHold({ env, fetcher, git }) {
  const secret = typeof env.GH_TOKEN === 'string' && env.GH_TOKEN.length > 0 ? env.GH_TOKEN : null;
  let verdict;
  try {
    const mode = env.HOLD_MODE;
    const repo = env.GITHUB_REPOSITORY;
    const problem = inputProblem({ mode, repo });
    if (problem) {
      verdict = cannotCheck(problem);
    } else {
      const versions = mode === 'pull-request' ? readVersions(git, { eventName: env.HOLD_EVENT_NAME, headSha: env.HOLD_HEAD_SHA }) : undefined;
      const get = createRequest({ fetcher, token: env.GH_TOKEN });
      verdict = decideHold({ mode, repo, holds: await listHolds(get, repo), versions });
    }
  } catch (error) {
    verdict = cannotCheck(error instanceof Error ? error.message : 'unexpected failure');
  }
  // Belt and braces: the token is never put in a message, and if some library did, it is masked.
  const lines = secret ? verdict.lines.map((line) => line.split(secret).join('***')) : verdict.lines;
  return { code: verdict.ok === true ? 0 : 1, lines };
}
