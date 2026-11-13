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
  return readBlob(git, match[3], maxBytes, unreadable, path);
}

// The bytes of the blob `id` (40 hex, from a listing git made), bounded: its size is asked first,
// so nothing larger than `maxBytes` is ever read (`unreadable` names that refusal). Read by id, not
// by path, so a path from a listing never becomes a pathspec (where `*` or `:(glob)` would mean
// something to git).
export function readBlob(git, id, maxBytes, unreadable, label) {
  if (!/^[a-f0-9]{40}$/.test(id)) refuse('git-failed', `blob of ${label}`);
  const size = Number(ask(git, ['cat-file', '-s', id], `size of ${label}`).toString('utf8').trim());
  if (!Number.isSafeInteger(size) || size < 0) refuse('git-failed', `size of ${label}`);
  if (size > maxBytes) refuse(unreadable, label);
  const bytes = ask(git, ['cat-file', 'blob', id], `read ${label}`);
  if (bytes.length !== size) refuse('git-failed', `read ${label}`);
  return bytes;
}

// The entries directly in folder `dir` at `commit` (no recursion): [{ mode, type, id, path }], an
// empty list when the commit has no such folder. `dir` is a fixed folder of the route's own (no
// pattern), asked with a trailing `/` so git lists what is in it. Every record must be exactly
// git's shape and lie directly in `dir`; anything else is git-failed, never guessed. At most
// `maxEntries` entries (more is `unreadable`).
export function listAtCommit(git, commit, dir, maxEntries, unreadable) {
  if (!isCommit(commit)) refuse('input-invalid', 'commit');
  const out = ask(git, ['ls-tree', '-z', '--full-tree', commit, '--', `${dir}/`], `ls-tree ${dir}`).toString('utf8');
  if (out === '') return [];
  if (!out.endsWith('\0')) refuse('git-failed', `ls-tree ${dir}`);
  const records = out.slice(0, -1).split('\0');
  if (records.length > maxEntries) refuse(unreadable, `more than ${maxEntries} entries in ${dir}`);
  return records.map((record) => {
    const match = /^([0-7]{6}) (blob|tree|commit) ([a-f0-9]{40})\t([^\0]+)$/.exec(record);
    if (!match || !match[4].startsWith(`${dir}/`) || match[4].slice(dir.length + 1).includes('/') || match[4].length === dir.length + 1)
      refuse('git-failed', `ls-tree ${dir}`);
    return { mode: match[1], type: match[2], id: match[3], path: match[4] };
  });
}
export const isRegularBlob = (entry) => entry.type === 'blob' && REGULAR.has(entry.mode);

// The commit `ref` names on origin, or null when origin has no such ref. Asked of `origin`
// itself, not of the local refs, which a shallow checkout does not hold. An annotated tag is
// answered with its peeled line (`<ref>^{}`), whose commit is the one returned.
// A BRANCH is the opposite: the tip of main is the commit the ref line itself names, and git never
// sends a peeled line for a branch, so one in the answer (`main=B` beside `main^{}=A`, which would
// make A the tip) means the answer is not git's: git-failed, never the commit. Second reader, N7.
// `peeled` says which rule applies: 'follow' (a tag) or 'refuse' (a branch).
// `ls-remote` matches the END of ref names, so a branch named `x/refs/heads/main` or
// `refs/tags/v1.5.0` adds lines of its own: those are IGNORED (refusing them would let anyone who
// can push a branch stop every release; found by the second reader). Only the lines whose ref is
// EXACTLY the one asked for, or its peeled line, count; a malformed line, or the exact ref twice,
// is git-failed: never guessed.
function remoteCommit(git, ref, question, peeled) {
  // Both patterns: git prints the peeled line of an annotated tag only when it is asked for.
  const out = ask(git, ['ls-remote', 'origin', ref, `${ref}^{}`], question).toString('utf8');
  if (out === '') return null;
  if (!out.endsWith('\n')) refuse('git-failed', question);
  const found = new Map();
  for (const line of out.slice(0, -1).split('\n')) {
    const match = /^([a-f0-9]{40})\t(\S+)$/.exec(line);
    if (!match) refuse('git-failed', question);
    if (match[2] !== ref && match[2] !== `${ref}^{}`) continue;
    if (found.has(match[2])) refuse('git-failed', question);
    found.set(match[2], match[1]);
  }
  if (peeled === 'refuse' && found.has(`${ref}^{}`)) refuse('git-failed', question);
  if (!found.has(ref)) {
    if (found.size > 0) refuse('git-failed', question);
    return null;
  }
  return found.get(`${ref}^{}`) ?? found.get(ref);
}

// The commit tag v<version> points at on origin, or null.
export function tagCommit(git, version) {
  if (!isPlainVersion(version)) refuse('input-invalid', 'version');
  return remoteCommit(git, `refs/tags/v${version}`, 'ls-remote tags', 'follow');
}
export const tagExists = (git, version) => tagCommit(git, version) !== null;

// The commit at the tip of origin's main. Measured, so "is this run's commit still the tip of
// main" is a fact the route reads, not one it is told.
export function mainTip(git) {
  const tip = remoteCommit(git, 'refs/heads/main', 'ls-remote main', 'refuse');
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
