import { entryDifferences } from './entries.mjs';

function finding(rule, path, reason) { return { rule, path, line: 1, name: null, reason }; }

export function compareReplay(head, replay, entries) {
  const differences = entryDifferences(entries.expected, entries.actual);
  if (head.tree === replay.tree && differences.length) throw new Error('Equal tree IDs have inconsistent entry data.');
  const findings = [], unverified = [];
  if (replay.status === 'clean') {
    if (head.tree !== replay.tree) findings.push(finding('merge-tree', '', 'Merge tree differs from the automatic replay.'));
  } else if (!replay.conflictPaths.length) {
    unverified.push({ kind: 'merge-conflicts', path: '', line: 1,
      reason: 'Git reported a conflicted merge without exact conflict file entries.' });
  } else {
    const permitted = new Set(replay.conflictPaths);
    for (const item of differences) if (!permitted.has(item.path)) findings.push(finding('merge-conflict-scope', item.path,
      'Merge content or mode differs outside an exact Git-reported conflict path.'));
  }
  return { findings, unverified, differences };
}
