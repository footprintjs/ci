// A git door that answers the route's four questions from recorded files, the way git itself
// does: `ls-tree -z --full-tree`, `cat-file -s`, `cat-file blob`, and `ls-remote` (recorded
// text). Blob ids are git's own (sha1 of "blob <size>\0<bytes>"), so a fixture that is not the
// real blob shows up as a different id. Anything else throws, like a failing git.
import { createHash } from 'node:crypto';

export const blobId = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

// lsRemote answers `ls-remote origin refs/tags/...`; mainTip (default: `commit`) answers
// `ls-remote origin refs/heads/main`, or `mainTip: null` for a remote with no main.
export function recordedGit({ commit, files, lsRemote = '', modes = {}, mainTip = commit }) {
  const blobs = new Map(Object.values(files).map((bytes) => [blobId(bytes), bytes]));
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    const [command, ...rest] = args;
    if (command === 'ls-tree' && rest[0] === '-z' && rest[1] === '--full-tree' && rest[2] === commit && rest[3] === '--') {
      const bytes = files[rest[4]];
      return Buffer.from(bytes === undefined ? '' : `${modes[rest[4]] ?? '100644 blob'} ${blobId(bytes)}\t${rest[4]}\0`);
    }
    if (command === 'cat-file' && rest[0] === '-s' && blobs.has(rest[1])) return Buffer.from(`${blobs.get(rest[1]).length}\n`);
    if (command === 'cat-file' && rest[0] === 'blob' && blobs.has(rest[1])) return blobs.get(rest[1]);
    if (command === 'ls-remote' && rest[0] === 'origin' && rest[1] === 'refs/heads/main')
      return Buffer.from(mainTip === null ? '' : `${mainTip}\trefs/heads/main\n`);
    if (command === 'ls-remote' && rest[0] === 'origin' && rest[1].startsWith('refs/tags/')) return Buffer.from(lsRemote);
    throw new Error(`git ${args.join(' ')} failed`);
  };
  return { git, calls };
}
