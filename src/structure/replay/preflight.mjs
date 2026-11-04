import { parseVersion } from './version.mjs';
import { checkedHead, checkedAttributeTrees } from './head.mjs';
import { attributeCoverage } from './attributes.mjs';

/** Pure preflight; native callers must stop before replay when incomplete. */
export function replayPreflight(head, versionRaw) {
  checkedHead(head);
  const gitVersion = parseVersion(versionRaw);
  const unverified = head.parents.length === 2 ? attributeCoverage(checkedAttributeTrees(head)) : [{
    kind: 'merge-parent-count', path: '', line: 1, reason: 'Only a two-parent merge replay is supported.' }];
  return { gitVersion, unverified };
}
