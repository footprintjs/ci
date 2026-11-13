// The decision table: every row by name, totality over every combination of facts, no mode while
// any fact is unknown, and no overlap between rows that nobody declared.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches, plan, seenFacts } from '../../src/release-route/plan.mjs';
import { FACTS, RULES, WRITING_MODES } from '../../src/release-route/rules.mjs';
import { REFUSALS } from '../../src/release-route/refusals.mjs';

// A publish that should go through; each row's case changes only what that row needs.
const GOOD = Object.freeze({ action: 'publish', toolCommitPlain: true, toolReviewed: true, pinsAgree: true, settingsRead: true, packageNamed: true,
  packagePrivate: false, versionPlain: true, packageKnown: true, tagExists: false, tagAtCommit: false, releaseExists: false, npmHasVersion: false,
  changelogFound: true, versionNewer: true, refIsMain: true, commitIsMainTip: true });
// A version that is tagged (at this commit), on npm and released on GitHub.
const DONE = Object.freeze({ tagExists: true, tagAtCommit: true, releaseExists: true, npmHasVersion: true, versionNewer: false });
const outcome = (facts) => {
  const result = plan({ facts });
  return result.refuse ? `${result.rule} -> refuse ${result.refuse}` : `${result.rule} -> ${result.mode} (compare ${result.compare})`;
};

const CASES = [
  [{ toolCommitPlain: false, toolReviewed: null }, 'tool-commit-invalid -> refuse tool-commit-invalid'],
  [{ toolReviewed: false }, 'tool-not-reviewed -> refuse tool-not-reviewed'],
  [{ pinsAgree: false }, 'pins-differ -> refuse pins-differ'],
  [{ pinsAgree: false, ...DONE, action: 'dry-run', refIsMain: false }, 'pins-differ -> refuse pins-differ'],
  [{ pinsAgree: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ packageNamed: false }, 'package-unnamed -> refuse not-publishable'],
  [{ packagePrivate: true }, 'package-private -> refuse not-publishable'],
  [{ versionPlain: false, versionNewer: null, changelogFound: null }, 'version-not-plain -> refuse version-not-plain'],
  [{ packageKnown: false, npmHasVersion: null, versionNewer: null }, 'package-unknown -> refuse package-unknown'],
  [{ tagExists: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ settingsRead: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ action: 'prepare' }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ ...DONE }, 'released -> nothing (compare no)'],
  [{ ...DONE, tagAtCommit: false }, 'released -> nothing (compare no)'],
  [{ ...DONE, tagAtCommit: false, commitIsMainTip: false }, 'released -> nothing (compare no)'],
  [{ ...DONE, refIsMain: false }, 'released -> nothing (compare no)'],
  // Correction 1: a dry run of a released version compares with npm only at the commit its tag names.
  [{ ...DONE, action: 'dry-run' }, 'dry-run-released -> dry-run (compare yes)'],
  [{ ...DONE, action: 'dry-run', tagAtCommit: false }, 'dry-run-not-released-commit -> dry-run (compare no)'],
  [{ ...DONE, action: 'dry-run', tagAtCommit: false, releaseExists: false, refIsMain: false }, 'dry-run-not-released-commit -> dry-run (compare no)'],
  [{ ...DONE, action: 'dry-run', tagAtCommit: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ tagExists: true, npmHasVersion: false }, 'tag-without-package -> refuse tag-without-package'],
  // Correction 7: tagged and on npm, no GitHub release.
  [{ ...DONE, releaseExists: false }, 'finish -> finish (compare no)'],
  [{ ...DONE, releaseExists: false, changelogFound: false }, 'finish-changelog-missing -> refuse changelog-missing'],
  [{ ...DONE, releaseExists: false, tagAtCommit: false }, 'finish-tag-elsewhere -> refuse tag-elsewhere'],
  [{ ...DONE, releaseExists: false, tagAtCommit: false, changelogFound: false }, 'finish-tag-elsewhere -> refuse tag-elsewhere'],
  [{ ...DONE, releaseExists: false, commitIsMainTip: false }, 'finish-not-tip -> nothing (compare no)'],
  [{ ...DONE, releaseExists: false, commitIsMainTip: false, tagAtCommit: false }, 'finish-not-tip -> nothing (compare no)'],
  [{ ...DONE, releaseExists: false, refIsMain: false }, 'finish-off-main -> refuse finish-off-main'],
  [{ ...DONE, releaseExists: false, refIsMain: false, commitIsMainTip: false }, 'finish-off-main -> refuse finish-off-main'],
  [{ ...DONE, releaseExists: false, action: 'dry-run' }, 'dry-run-released -> dry-run (compare yes)'],
  [{ ...DONE, releaseExists: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ changelogFound: false }, 'changelog-missing -> refuse changelog-missing'],
  [{ changelogFound: false, npmHasVersion: true }, 'changelog-missing -> refuse changelog-missing'],
  [{ npmHasVersion: true, versionNewer: false }, 'recover -> recover (compare yes)'],
  [{ npmHasVersion: true, versionNewer: false, refIsMain: false }, 'recover-off-main -> refuse recover-off-main'],
  [{ npmHasVersion: true, versionNewer: false, action: 'dry-run' }, 'dry-run-recover -> dry-run (compare yes)'],
  [{ versionNewer: false }, 'version-not-newer -> refuse version-not-newer'],
  [{ refIsMain: false }, 'publish-off-main -> refuse publish-off-main'],
  [{ commitIsMainTip: false }, 'not-main-tip -> nothing (compare no)'],
  [{ commitIsMainTip: false, npmHasVersion: true, versionNewer: false }, 'unfinished-not-tip -> refuse release-unfinished'],
  [{ commitIsMainTip: false, npmHasVersion: true, versionNewer: false, changelogFound: false }, 'unfinished-not-tip -> refuse release-unfinished'],
  [{ commitIsMainTip: false, npmHasVersion: true, versionNewer: false, action: 'dry-run' }, 'dry-run-recover -> dry-run (compare yes)'],
  [{ commitIsMainTip: false, changelogFound: false }, 'not-main-tip -> nothing (compare no)'],
  [{ commitIsMainTip: false, versionNewer: false }, 'not-main-tip -> nothing (compare no)'],
  [{ commitIsMainTip: false, refIsMain: false }, 'publish-off-main -> refuse publish-off-main'],
  [{ commitIsMainTip: false, action: 'dry-run' }, 'dry-run-would-publish -> dry-run (compare no)'],
  [{ commitIsMainTip: false, ...DONE }, 'released -> nothing (compare no)'],
  [{ commitIsMainTip: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{}, 'publish -> publish (compare yes)'],
  [{ action: 'dry-run', refIsMain: false }, 'dry-run-would-publish -> dry-run (compare no)'],
];
for (const [change, expected] of CASES)
  test(`row: ${expected}`, () => assert.equal(outcome({ ...GOOD, ...change }), expected));

test('every row is reached by some case above, and every refusal a row names is in the table', () => {
  for (const rule of RULES) {
    assert.ok(rule.refuse === undefined || Object.hasOwn(REFUSALS, rule.refuse), rule.id);
    assert.ok(rule.refuse !== undefined || ['publish', 'recover', 'finish', 'dry-run', 'nothing'].includes(rule.mode), rule.id);
    assert.ok(rule.refuse !== undefined || ['yes', 'no'].includes(rule.compare), rule.id);
    for (const [name, value] of Object.entries(rule.when))
      assert.ok(name === 'factsReadable' ? value === false : FACTS[name].includes(value), `${rule.id}: ${name}`);
  }
  assert.equal(new Set(RULES.map((rule) => rule.id)).size, RULES.length);
  const reached = new Set(CASES.map(([, expected]) => expected.split(' ')[0]));
  for (const rule of RULES) assert.ok(reached.has(rule.id), `no case reaches ${rule.id}`);
});

// Every combination of fact values in their domains.
function* combinations(names = Object.keys(FACTS), partial = {}) {
  if (names.length === 0) { yield { ...partial }; return; }
  const [first, ...rest] = names;
  for (const value of FACTS[first]) yield* combinations(rest, { ...partial, [first]: value });
}
const all = [...combinations()];

test('the table is total: every combination of readable facts meets a row', () => {
  assert.equal(all.length, 2 ** 16);
  for (const facts of all) assert.notEqual(plan({ facts }).rule, 'no-rule-matched', JSON.stringify(facts));
});

test('fail closed: with any one fact unknown or out of its domain, the result is always a refusal', () => {
  for (const facts of all)
    for (const name of Object.keys(FACTS))
      for (const bad of [null, undefined, 'true', 1]) {
        const result = plan({ facts: { ...facts, [name]: bad } });
        assert.ok(result.refuse, `${name}=${String(bad)} gave ${result.mode}`);
      }
  assert.equal(plan({ facts: {} }).refuse !== undefined, true);
  assert.equal(plan({ facts: null }).refuse !== undefined, true);
});

test('every row whose mode writes requires main AND the tip of main, so a future writing mode cannot be added without them', () => {
  const writing = RULES.filter((rule) => WRITING_MODES.includes(rule.mode));
  assert.deepEqual(writing.map((rule) => rule.id), ['finish', 'recover', 'publish']);
  for (const rule of writing) {
    assert.equal(rule.when.refIsMain, true, `${rule.id} writes but does not require refIsMain: true`);
    assert.equal(rule.when.commitIsMainTip, true, `${rule.id} writes but does not require commitIsMainTip: true`);
  }
  for (const rule of RULES) assert.ok(rule.refuse !== undefined || WRITING_MODES.includes(rule.mode) || ['nothing', 'dry-run'].includes(rule.mode), rule.id);
});

test('over every combination of facts, nothing that writes is ever chosen off main or off its tip', () => {
  for (const facts of all) if (WRITING_MODES.includes(plan({ facts }).mode)) {
    assert.equal(facts.refIsMain, true, JSON.stringify(facts));
    assert.equal(facts.commitIsMainTip, true, JSON.stringify(facts));
  }
  for (const facts of all) if (!facts.refIsMain && facts.action === 'dry-run' && plan({ facts }).mode) assert.equal(plan({ facts }).mode, 'dry-run');
});

test('publish is chosen only when every gate holds', () => {
  for (const facts of all)
    if (plan({ facts }).mode === 'publish') {
      // tagAtCommit and releaseExists say nothing without a tag (observe.mjs reads them false); the table does not read them there.
      const { tagAtCommit, releaseExists, ...gates } = facts;
      const { tagAtCommit: _a, releaseExists: _b, ...good } = GOOD;
      assert.deepEqual(gates, good);
    }
});

// Correction 1: the rebuild of a released version is compared with npm only at the commit its tag
// names; at any other commit a dry run checks the build and compares nothing.
test('over every combination, a dry run of a tagged version compares with npm only when the tag names the planned commit', () => {
  for (const facts of all) {
    const result = plan({ facts });
    if (result.mode === 'dry-run' && facts.tagExists === true)
      assert.equal(result.compare, facts.tagAtCommit ? 'yes' : 'no', JSON.stringify(facts));
  }
});

// Correction 7: mode finish writes only the GitHub release, so it is chosen only for a version that
// is tagged at this commit and on npm, without a release, on the tip of main, asked to publish.
test('over every combination, finish is chosen only for a tag at this commit, a version npm has, no release, the tip of main', () => {
  let seen = 0;
  for (const facts of all)
    if (plan({ facts }).mode === 'finish') {
      seen++;
      for (const [name, value] of Object.entries({ action: 'publish', tagExists: true, tagAtCommit: true, npmHasVersion: true, releaseExists: false,
        refIsMain: true, commitIsMainTip: true, toolReviewed: true, pinsAgree: true, changelogFound: true }))
        assert.equal(facts[name], value, `${name} in ${JSON.stringify(facts)}`);
    }
  assert.ok(seen > 0);
});

test('over every combination, a version that is tagged and on npm without its GitHub release is never green-and-done (released) when asked to publish', () => {
  for (const facts of all) {
    const result = plan({ facts });
    if (facts.action === 'publish' && facts.tagExists && facts.npmHasVersion && facts.releaseExists === false) assert.notEqual(result.rule, 'released');
  }
});

test('with no row, the result is the no-rule-matched refusal', () => {
  assert.equal(outcome(GOOD).startsWith('publish'), true);
  assert.deepEqual([plan({ facts: GOOD }, []).rule, plan({ facts: GOOD }, []).refuse], ['no-rule-matched', 'no-rule-matched']);
});

// Pairs (earlier, later) that both match some facts with different results, where the earlier
// row does not declare that it outranks the later one.
function undeclaredOverlaps(rules) {
  const result = (rule) => rule.refuse ?? `${rule.mode}/${rule.compare}`;
  const found = new Set();
  const facts = [...all, ...all.flatMap((f) => Object.keys(FACTS).map((name) => ({ ...f, [name]: null })))];
  for (const fact of facts) {
    const seen = seenFacts(fact);
    const hits = rules.filter((rule) => matches(rule, seen));
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const declared = hits[i].outranks === 'later' || (hits[i].outranks ?? []).includes(hits[j].id);
        if (!declared && result(hits[i]) !== result(hits[j])) found.add(`${hits[i].id} > ${hits[j].id}`);
      }
  }
  return [...found].sort();
}

test('no two rows overlap with different results unless the earlier one says it outranks the later', () => {
  assert.deepEqual(undeclaredOverlaps(RULES), []);
});

test('every declared outrank is real, so a stale declaration cannot hide a later change', () => {
  for (const [index, rule] of RULES.entries())
    for (const later of Array.isArray(rule.outranks) ? rule.outranks : []) {
      const target = RULES.findIndex((other) => other.id === later);
      assert.ok(target > index, `${rule.id} outranks ${later}, which is not later`);
      const overlap = all.some((facts) => matches(rule, seenFacts(facts)) && matches(RULES[target], seenFacts(facts)));
      assert.ok(overlap, `${rule.id} declares it outranks ${later}, but they never both match`);
    }
});

test('the overlap check goes red when a declaration is removed', () => {
  const without = RULES.map((rule) => (rule.id === 'changelog-missing' ? { ...rule, outranks: undefined } : rule));
  assert.ok(undeclaredOverlaps(without).includes('changelog-missing > publish'));
  const swapped = [...RULES];
  const a = swapped.findIndex((r) => r.id === 'publish');
  const b = swapped.findIndex((r) => r.id === 'publish-off-main');
  [swapped[a], swapped[b]] = [{ ...swapped[b], when: { tagExists: false, npmHasVersion: false, action: 'publish' } }, swapped[a]];
  assert.ok(undeclaredOverlaps(swapped).length > 0);
});
