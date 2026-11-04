'use strict';
const preparation = require('./release-prepare.cjs');
const control = require('./release-control.cjs');
const { readGitBlob } = require('./git-blob.cjs');
const prefix = (context) => {
  if (context.repository?.full_name !== 'footprintjs/foottrace' || !Number.isSafeInteger(context.repository.id))
    fail('repository');
  return `/repos/${context.repository.full_name}`;
};
const fail = code => { const error = new Error(code); error.code = code; throw error; };
// ONE bounded native Git decoder for source admission and object observations.
// Callers own repository pinning, fresh views and all effect eligibility.
function sourceView(api, context) {
  const commits = new Map(), blobs = new Map(), inventories = new Map();
  const rawPaths = new Set(['package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md', 'docs/metadata.md',
    '.github/workflows/publish.yml', 'scripts/release-app-auth.cjs', 'scripts/release-runner.cjs',
    'test/release/app-identity.test.mjs', 'test/release/archive.test.mjs', 'test/release/diagnostics.test.mjs']);
  let totalBytes = 0;
  const commit = async (id) => {
    if (!control.validSha(id)) fail('source-sha');
    if (!commits.has(id)) {
      if (commits.size >= 512) fail('recovery-source');
      const value = (await api('GET', `${prefix(context)}/git/commits/${id}`)).data;
      if (value.sha !== id || !control.validSha(value.tree?.sha) || !Array.isArray(value.parents) ||
        value.parents.length > 2 || value.parents.some((p) => !control.validSha(p.sha))) fail('source-commit');
      commits.set(id, value);
    }
    return commits.get(id);
  };
  const blob = async (id) => {
    prefix(context);
    if (!control.validSha(id)) fail('source-sha');
    if (!blobs.has(id)) {
      const bytes = await readGitBlob(api, context, id);
      totalBytes += bytes.length;
      if (totalBytes > 128 * 1024 * 1024) fail('source-content');
      blobs.set(id, bytes);
    }
    return Buffer.from(blobs.get(id));
  };
  const tree = async (id) => {
    if (!control.validSha(id)) fail('source-sha');
    const result = new Map();
    const tree = (await api('GET', `${prefix(context)}/git/trees/${id}?recursive=1`)).data;
    if (tree.sha !== id || tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.length > 4096)
      fail('source-tree');
    const seen = new Set();
    for (const row of tree.tree) {
      if (typeof row.path !== 'string' || seen.has(row.path) || !control.validSha(row.sha)) fail('source-tree');
      seen.add(row.path);
      if (row.type === 'tree' && row.mode === '040000') continue;
      if (row.type !== 'blob' || !['100644', '100755'].includes(row.mode)) fail('source-tree');
      // The complete immutable path/OID/mode inventory is the existing Git
      // source identity basis. Fetch raw bytes only for semantic admission and
      // the finite byte-transition exceptions, never a compare.files subset.
      const needsBytes = rawPaths.has(row.path) || row.path.startsWith('.changes/') || row.path.startsWith('.release/');
      if (needsBytes) await blob(row.sha);
      result.set(row.path, { sha: row.sha, mode: row.mode, ...(needsBytes ? { bytes: blobs.get(row.sha) } : {}) });
    }
    if (preparation.treeOid(result) !== id) fail('source-tree');
    return result;
  };
  const inventory = async (id) => {
    if (inventories.has(id)) return inventories.get(id);
    const c = await commit(id), result = await tree(c.tree.sha);
    inventories.set(id, result);
    return result;
  };
  return { commit, inventory, blob, tree };
}
module.exports = { sourceView };
