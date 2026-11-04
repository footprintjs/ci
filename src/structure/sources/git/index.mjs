import { gitBytes } from './process.mjs';
import { treeEntries } from './trees.mjs';
import { readBlobs } from './blobs.mjs';

export function readGitSnapshot(repo, revision = 'HEAD') {
  if (typeof revision !== 'string' || !revision || revision.startsWith('-') || /[\0\r\n]/.test(revision)) {
    throw new TypeError('Invalid commit revision.');
  }
  let id;
  try {
    id = gitBytes(repo, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`]).toString('utf8').trim();
  } catch { throw new Error('Cannot resolve commit revision in the candidate repository.'); }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id)) throw new Error('Git returned an invalid commit id.');
  const entries = treeEntries(gitBytes(repo, ['ls-tree', '-r', '-z', '--full-tree', id]));
  const contents = readBlobs(repo, entries);
  return { id, files: entries.map(entry => ({ ...entry,
    content: contents.has(entry.oid) ? 'utf8' : 'path-only', text: contents.get(entry.oid) ?? '' })) };
}
