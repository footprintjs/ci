export const ids = { head: '1'.repeat(40), left: '2'.repeat(40), right: '3'.repeat(40),
  tree: '4'.repeat(40), different: '5'.repeat(40), blob: '6'.repeat(40), changed: '7'.repeat(40) };
export const raw = (exitCode, stdout, stderr = '') => ({ exitCode, stdout, stderr });
export const entry = (path, oid = ids.blob, mode = '100644', type = 'blob') => ({ path, oid, mode, type });
export function fixture() {
  const entries = [entry('src/left.ts'), entry('src/right.ts')];
  return { head: { id: ids.head, parents: [ids.left, ids.right], tree: ids.tree, entries,
    attributeTrees: [ids.head, ids.left, ids.right].map(id => ({ id, files: [] })) },
  replay: { version: raw(0, 'git version 2.50.1\n'), mergeTree: raw(0, `${ids.tree}\0`), entries } };
}
