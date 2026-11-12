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

// Does the remote have tag v<version>? Asked of `origin` itself, not of the local tag list,
// which a shallow checkout does not hold.
export function tagExists(git, version) {
  if (!isPlainVersion(version)) refuse('input-invalid', 'version');
  const ref = `refs/tags/v${version}`;
  const out = ask(git, ['ls-remote', '--tags', '--refs', 'origin', ref], 'ls-remote tags').toString('utf8');
  if (out === '') return false;
  if (new RegExp(`^[a-f0-9]{40}\\t${ref.replace(/\./g, '\\.')}\\n$`).test(out)) return true;
  refuse('git-failed', 'ls-remote tags');
}

// The checkout must be exactly `commit` with nothing changed or added (build runs repository
// commands there; they must run on the planned commit, not on something left behind).
export function requireCleanCheckout(git, commit) {
  if (!isCommit(commit)) refuse('input-invalid', 'commit');
  const head = ask(git, ['rev-parse', '--verify', 'HEAD^{commit}'], 'rev-parse HEAD').toString('utf8').trim();
  if (head !== commit) refuse('checkout-mismatch', 'HEAD is another commit');
  const status = ask(git, ['status', '--porcelain', '--untracked-files=all'], 'status').toString('utf8');
  if (status !== '') refuse('checkout-mismatch', 'the tree has changes');
}
