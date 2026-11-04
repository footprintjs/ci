import { checkedObjectId, checkedPath } from './grammar.mjs';

const TYPES = new Map([['100644', 'blob'], ['100755', 'blob'], ['120000', 'blob'], ['160000', 'commit'], ['040000', 'tree']]);

/** Leaves plus EMPTY trees only; nonempty directories are derived, not entries. */
export function canonicalEntries(values, width) {
  if (!Array.isArray(values)) throw new TypeError('Missing canonical tree entries.');
  const entries = new Map();
  for (const value of values) {
    if (!value || !TYPES.has(value.mode) || TYPES.get(value.mode) !== value.type) throw new TypeError('Invalid tree entry mode/type.');
    const path = checkedPath(value.path), oid = checkedObjectId(value.oid, width);
    if (entries.has(path)) throw new TypeError('Duplicate tree entry path.');
    entries.set(path, { path, mode: value.mode, type: value.type, oid });
  }
  for (const path of entries.keys()) {
    const parts = path.split('/'); parts.pop();
    while (parts.length) {
      if (entries.has(parts.join('/'))) throw new TypeError('Canonical tree entries contain a nonempty parent entry.');
      parts.pop();
    }
  }
  return [...entries.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

export function entryDifferences(expected, actual) {
  const before = new Map(expected.map(entry => [entry.path, entry]));
  const after = new Map(actual.map(entry => [entry.path, entry]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(path => {
    const left = before.get(path) ?? null, right = after.get(path) ?? null;
    return JSON.stringify(left) === JSON.stringify(right) ? [] : [{ path, before: left, after: right }];
  });
}
