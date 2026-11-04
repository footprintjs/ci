import { checkedRaw, checkedObjectId, checkedPath } from './grammar.mjs';

/** Only --write-tree --name-only --no-messages -z, without --stdin. */
export function parseMergeOutput(observed, width) {
  const value = checkedRaw(observed);
  if (![0, 1].includes(value.exitCode) || !value.stdout.endsWith('\0')) {
    throw new Error('Git merge-tree did not return the supported NUL protocol.');
  }
  const records = value.stdout.split('\0');
  records.pop();
  const tree = checkedObjectId(records.shift(), width);
  if (value.exitCode === 0 && records.length) throw new Error('Clean merge-tree output contains extra records.');
  const conflictPaths = records.map(checkedPath);
  if (new Set(conflictPaths).size !== conflictPaths.length) throw new Error('Git repeated a conflict path.');
  return { status: value.exitCode === 0 ? 'clean' : 'conflicted', tree, conflictPaths };
}
