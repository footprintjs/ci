// The publish job's last question before `npm publish`: publish, do not publish again, or refuse.
//
// THE RULE OF THE PUBLISH JOB: everything that must be true at the moment of publishing is
// measured in the publish job, directly before the publishing step. The plan decides whether to
// try; it is never the proof. Why: GitHub's "Re-run failed jobs" keeps the outputs of the jobs it
// does not re-run, so a publish job re-run days later works from the OLD plan (its commit, its
// version). Example, found by the second reader of the workflows: 1.4.0 is held, 1.5.0 is merged
// and published, the hold is lifted, the old run is re-run: without this, 1.4.0 is published after
// 1.5.0 and npm's `latest` goes backward.
//
//   npm lacks the version, the commit is still the tip of main
//     and the version still newer than every published one      -> publish=yes
//   npm lacks the version, either of those two no longer holds   -> refuse plan-stale (names which)
//   npm lacks the version, either cannot be read                 -> refuse fact-unreadable
//   npm has it, integrity and served bytes equal                 -> publish=no (a re-run after npm
//                                                                   accepted: go on to verify, tag,
//                                                                   release; the tip is NOT asked,
//                                                                   this is how an unfinished
//                                                                   release is finished)
//   npm has it with other bytes                                  -> refuse registry-differs
//
// The two facts are measured with the plan's own readers (observe.mjs · observeTip, observeNpm),
// one owner, no second way to ask. The decision is the pure `decideReady`.
import { observeNpm, observeTip } from './observe.mjs';
import { downloadTarball, integrityOf, readDist } from './registry.mjs';
import { Refusal, refuse } from './refusals.mjs';

// The plan's facts that must still hold when npm lacks the version.
const STILL_TRUE = Object.freeze(['commitIsMainTip', 'versionNewer']);

// causes: the refusal that left a fact unreadable, by fact name (shown in the detail).
export function decideReady(facts, causes = {}) {
  const { npmHasVersion, integrityEqual, bytesEqual } = facts;
  if (npmHasVersion === false) {
    const stale = STILL_TRUE.filter((name) => facts[name] === false);
    if (stale.length > 0) refuse('plan-stale', stale.join(', '));
    const unread = STILL_TRUE.find((name) => facts[name] !== true);
    if (unread) refuse('fact-unreadable', `${unread} (${causes[unread]?.code ?? 'not asked'})`);
    return 'yes';
  }
  if (npmHasVersion !== true) refuse('fact-unreadable', 'npmHasVersion');
  if (integrityEqual !== true) refuse('registry-differs', 'integrity');
  if (bytesEqual !== true) refuse('registry-differs', 'tarball bytes');
  return 'no';
}

// git: the door into the caller's checkout (its origin is asked for refs/heads/main).
export async function ready({ fetcher, git, name, version, commit, localBytes }) {
  const local = integrityOf(localBytes);
  const dist = await readDist({ fetcher, name, version });
  if (dist === null) {
    const tip = await observeTip({ git, commit });
    const npm = await observeNpm({ fetcher, name, version });
    // versionNewer is not asked when npm's package document could not be read, or names no such
    // package: the cause shown is the one that stopped it.
    const npmCause = npm.causes.versionNewer ?? npm.causes.packageKnown ??
      (npm.facts.packageKnown === false ? new Refusal('package-unknown') : undefined);
    return decideReady({ npmHasVersion: false, commitIsMainTip: tip.facts.commitIsMainTip, versionNewer: npm.facts.versionNewer },
      { commitIsMainTip: tip.causes.commitIsMainTip, versionNewer: npmCause });
  }
  const integrityEqual = dist.integrity === local;
  const bytesEqual = integrityEqual ? integrityOf(await downloadTarball({ fetcher, url: dist.tarball })) === local : false;
  return decideReady({ npmHasVersion: true, integrityEqual, bytesEqual });
}
