// The route's questions to git, with fixed arguments only, through an injected door:
// `git(args) -> Buffer` (stdout), throwing when git fails. Nothing here builds a shell string;
// a version reaches git only after identity.mjs said it is plain x.y.z, a commit only as 40 hex.
//
// Files are read from COMMITTED blobs at a named commit, never from the working tree by path:
// the route reads exactly the commit it plans for, and a symlink named package.json is refused
// (its blob would be the link target's text) instead of followed.
import { isCommit, isPlainVersion } from './identity.mjs';
import { refuse } from './refusals.mjs';

const REGULAR = new Set(['100644', '100755']);

function ask(git, args, question) {
  try {
    const out = git(args);
    return Buffer.isBuffer(out) ? out : Buffer.from(String(out));
  } catch {
    refuse('git-failed', question);
  }
}

// The bytes of `path` at `commit`; null when the commit has no such path. `unreadable` is the
// refusal code for a path that is there but not a regular file, or larger than `maxBytes`.
export function readAtCommit(git, commit, path, maxBytes, unreadable) {
  if (!isCommit(commit)) refuse('input-invalid', 'commit');
  const listing = ask(git, ['ls-tree', '-z', '--full-tree', commit, '--', path], `ls-tree ${path}`).toString('utf8');
  if (listing === '') return null;
  const match = /^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t([^\0]+)\0$/.exec(listing);
  if (!match || match[4] !== path) refuse('git-failed', `ls-tree ${path}`);
  if (match[2] !== 'blob' || !REGULAR.has(match[1])) refuse(unreadable, path);
  const size = Number(ask(git, ['cat-file', '-s', match[3]], `size of ${path}`).toString('utf8').trim());
  if (!Number.isSafeInteger(size) || size < 0) refuse('git-failed', `size of ${path}`);
  if (size > maxBytes) refuse(unreadable, path);
  const bytes = ask(git, ['cat-file', 'blob', match[3]], `read ${path}`);
  if (bytes.length !== size) refuse('git-failed', `read ${path}`);
  return bytes;
}

// The commit `ref` names on origin, or null when origin has no such ref. Asked of `origin`
// itself, not of the local refs, which a shallow checkout does not hold. An annotated tag is
// answered with its peeled line (`<ref>^{}`), whose commit is the one returned. Any other line
// (another ref the pattern matched, a malformed line) is git-failed: never guessed.
function remoteCommit(git, ref, question) {
  // Both patterns: git prints the peeled line of an annotated tag only when it is asked for.
  const out = ask(git, ['ls-remote', 'origin', ref, `${ref}^{}`], question).toString('utf8');
  if (out === '') return null;
  const found = new Map();
  for (const line of out.split('\n').slice(0, -1)) {
    const match = /^([a-f0-9]{40})\t(.+)$/.exec(line);
    if (!match || (match[2] !== ref && match[2] !== `${ref}^{}`) || found.has(match[2])) refuse('git-failed', question);
    found.set(match[2], match[1]);
  }
  if (!out.endsWith('\n') || !found.has(ref)) refuse('git-failed', question);
  return found.get(`${ref}^{}`) ?? found.get(ref);
}

// The commit tag v<version> points at on origin, or null.
export function tagCommit(git, version) {
  if (!isPlainVersion(version)) refuse('input-invalid', 'version');
  return remoteCommit(git, `refs/tags/v${version}`, 'ls-remote tags');
}
export const tagExists = (git, version) => tagCommit(git, version) !== null;

// The commit at the tip of origin's main. Measured, so "is this run's commit still the tip of
// main" is a fact the route reads, not one it is told.
export function mainTip(git) {
  const tip = remoteCommit(git, 'refs/heads/main', 'ls-remote main');
  if (tip === null) refuse('git-failed', 'ls-remote main');
  return tip;
}

// The checkout must be exactly `commit` with nothing changed or added (build runs repository
// commands there; they must run on the planned commit, not on something left behind).
export function requireCleanCheckout(git, commit) {
  if (!isCommit(commit)) refuse('input-invalid', 'commit');
  const head = ask(git, ['rev-parse', '--verify', 'HEAD^{commit}'], 'rev-parse HEAD').toString('utf8').trim();
  if (head !== commit) refuse('checkout-mismatch', 'HEAD is another commit');
  // --ignored too: a gitignored leftover (a node_modules, a dist/) is something left behind as
  // much as an untracked file is, and the build would pack or run it.
  const status = ask(git, ['status', '--porcelain', '--untracked-files=all', '--ignored'], 'status').toString('utf8');
  if (status !== '') refuse('checkout-mismatch', 'the tree has changes');
}
