import { replayPreflight } from './preflight.mjs';
import { parseMergeOutput } from './output.mjs';
import { canonicalEntries } from './entries.mjs';
import { compareReplay } from './compare.mjs';

/** Pure advisory observation. Native object/process provenance belongs to its adapter. */
export function verifyMerge({ head, replay }) {
  const preflight = replayPreflight(head, replay?.version);
  let parsed = { status: 'not-replayed', tree: null, conflictPaths: [] };
  let compared = { findings: [], differences: [], unverified: [] };
  if (!preflight.unverified.length) {
    parsed = parseMergeOutput(replay.mergeTree, head.id.length);
    compared = compareReplay(head, parsed, { actual: canonicalEntries(head.entries, head.id.length),
      expected: canonicalEntries(replay.entries, head.id.length) });
  }
  const unverified = [...preflight.unverified, ...compared.unverified];
  return { verification: 'merge', headId: head.id, parents: [...head.parents], tree: head.tree,
    replay: { ...parsed, gitVersion: preflight.gitVersion }, findings: compared.findings,
    coverage: { complete: unverified.length === 0, unverified }, differences: compared.differences };
}
