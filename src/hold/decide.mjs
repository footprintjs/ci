// The hold decision as a pure function: data in, data out. No network, no filesystem,
// no clock. Everything the check prints is built here, so there is ONE place that
// decides what a blocked person reads and ONE place that cleans untrusted text.
//
// Why a hold exists: on 12 Nov 2026 one session was told to hold a release and another
// session, which could not see that, published it. A published npm version cannot be
// taken back, so the hold lives in the repository, as a label, where a machine reads it.
import { clean } from '../shared/text.mjs';
import { isRepository } from '../shared/github.mjs';

export const LABEL = 'hold-release';
export const MODES = Object.freeze(['publish', 'pull-request']);
const MAX_LISTED = 50;

// Titles and versions come from people (a pull request's head can say anything), and they are
// printed into a CI log. The one cleaner for such text is src/shared/text.mjs · clean (control,
// format and bidi characters out, `::` and `##[` broken apart, cut); it is re-exported here
// because the hold check prints with it. A line we print never STARTS with untrusted text either
// (see `lines` below).
export { clean };

// A gate that cannot look must not say "no hold": every failure to check lands here.
export function cannotCheck(reason) {
  return { ok: false, checked: false, lines: [
    `Hold check FAILED: could not check for a hold (${clean(reason, 200) || 'unknown reason'}).`,
    'A release gate that cannot look must not say "no hold", so this job fails. Re-run it; if it keeps failing, ask whoever owns the release.',
  ] };
}

// The first reason the inputs are unusable, or null. Asked before any request is made.
export function inputProblem({ mode, repo }) {
  if (!MODES.includes(mode)) return `unknown mode, expected one of ${MODES.join(', ')}`;
  if (!isRepository(repo))
    return 'repository name is missing or malformed';
  return null;
}

const validHold = (item) => item !== null && typeof item === 'object' && Number.isSafeInteger(item.number) &&
  item.number > 0 && typeof item.title === 'string';

// holds: [{ number, title, pullRequest? }] as listed by the command (open, labelled).
// versions: { base, head } package.json versions; read only in pull-request mode.
export function decideHold({ mode, repo, holds, versions }) {
  const problem = inputProblem({ mode, repo });
  if (problem) return cannotCheck(problem);
  if (!Array.isArray(holds) || !holds.every(validHold)) return cannotCheck('the list of holds is not in the expected shape');
  // A pull request is judged by its versions even when no hold is open: unreadable is never "fine".
  const readable = (v) => typeof v === 'string' && v.length > 0;
  if (mode === 'pull-request' && !(readable(versions?.base) && readable(versions?.head)))
    return cannotCheck('package.json version is unreadable on the base or the head side');
  const sorted = [...new Map(holds.map((hold) => [hold.number, hold])).values()].sort((a, b) => a.number - b.number);
  const listing = [
    ...sorted.slice(0, MAX_LISTED).map((hold) =>
      `  - #${hold.number} ${hold.pullRequest ? '(pull request) ' : ''}"${clean(hold.title)}" https://github.com/${repo}/issues/${hold.number}`),
    ...(sorted.length > MAX_LISTED ? [`  - and ${sorted.length - MAX_LISTED} more`] : []),
  ];
  if (sorted.length === 0)
    return { ok: true, checked: true, lines: [`Hold check passed: no open issue or pull request in ${repo} carries "${LABEL}".`] };

  let releasing = true;
  const reasonLines = [];
  if (mode === 'pull-request') {
    const { base, head } = versions;
    releasing = base !== head;
    if (!releasing) {
      return { ok: true, checked: true, lines: [
        `Hold check passed for this pull request: it leaves the package.json version alone (${clean(head, 40)}).`,
        `${sorted.length} open item(s) carry "${LABEL}" and still block every release:`, ...listing,
      ] };
    }
    reasonLines.push(`This pull request changes the package.json version (${clean(base, 40)} -> ${clean(head, 40)}), so it is a release or heading pull request.`);
  }
  return { ok: false, checked: true, lines: [
    `Hold check FAILED: a release is on hold in ${repo}.`,
    `Open items labelled "${LABEL}" (${sorted.length}):`, ...listing, ...reasonLines,
    'Ask whoever set the hold. To lift it, remove the label or close the item.',
    ...(mode === 'pull-request' ? ['A pull request that leaves the package.json version alone is not blocked.'] : []),
  ] };
}
