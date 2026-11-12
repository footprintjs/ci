// The two versions a pull request is judged by, read from COMMITTED blobs in git:
// nothing is executed and no file of the candidate is opened by path (a symlink named
// package.json would be read as its own target text and fail the JSON check below).
// `git` is injected: (args) => stdout string, throwing when git fails.
//
// Which commits? The job checks out the pull request's MERGE commit M (refs/pull/N/merge):
// parent 1 is the base tip M was really made on, parent 2 is the pull request's head.
// So "the version before" is M^1 and "the version after" is M. Using the event's recorded
// base SHA instead would be wrong when the base branch moved and bumped the version after
// that SHA was recorded: an ordinary pull request would look like a release (and the
// mirror case could hide one). Before trusting any of that, we PROVE the checkout is this
// pull request's merge commit; anything we cannot show is "could not check".
const SHA = /^[a-f0-9]{40}$/;
const real = (sha) => typeof sha === 'string' && SHA.test(sha) && !/^0+$/.test(sha);

function versionAt(git, revision, side) {
  let text;
  try { text = git(['cat-file', 'blob', `${revision}:package.json`]); } catch { throw new Error(`package.json cannot be read on the ${side} side`); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`package.json is not JSON on the ${side} side`); }
  const version = parsed !== null && typeof parsed === 'object' && Object.hasOwn(parsed, 'version') ? parsed.version : undefined;
  if (typeof version !== 'string' || version.length === 0) throw new Error(`package.json has no version string on the ${side} side`);
  return version;
}

// eventName: the caller's event; headSha: the pull request's head commit from the event.
export function readVersions(git, { eventName, headSha }) {
  // pull_request_target is refused on purpose: it runs against the BASE, with no merge commit.
  if (eventName !== 'pull_request') throw new Error('pull-request mode only runs for a pull_request event');
  if (!real(headSha)) throw new Error('the pull request head SHA is missing or not a full commit SHA');
  let row;
  try { row = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' '); } catch { throw new Error('the checked-out commit cannot be inspected'); }
  if (row.length !== 3 || !row.every(real)) throw new Error('the checked-out commit is not a merge commit with exactly two parents');
  const [, first, second] = row;
  if (second !== headSha) throw new Error('the checked-out merge commit is not the merge of this pull request head');
  return { base: versionAt(git, first, 'base'), head: versionAt(git, 'HEAD', 'merged') };
}
