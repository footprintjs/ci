import { codePath } from '../paths.mjs';
import { referenceTextPath } from '../text-formats.mjs';

export function needsText(path) {
  return codePath(path) || referenceTextPath(path) || /(?:^|\/)package\.json$/.test(path)
    || /(?:^|\/)\.gitattributes$/.test(path);
}

export function treeEntries(buffer) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const records = decoder.decode(buffer).split('\0');
  if (records.pop() !== '') throw new Error('Git tree output is not NUL terminated.');
  return records.map(record => {
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error('Git returned an invalid tree entry.');
    const [, mode, type, oid, path] = match;
    if (needsText(path) && (type !== 'blob' || !['100644', '100755'].includes(mode))) {
      throw new Error(`Unsupported text entry mode at ${path}; symlinks are not followed.`);
    }
    return { path, mode, oid };
  });
}
