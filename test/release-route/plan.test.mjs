// The decision table: every row by name, totality over every combination of facts, no mode while
// any fact is unknown, and no overlap between rows that nobody declared.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matches, plan, seenFacts } from '../../src/release-route/plan.mjs';
import { FACTS, RULES } from '../../src/release-route/rules.mjs';
import { REFUSALS } from '../../src/release-route/refusals.mjs';

// A publish that should go through; each row's case changes only what that row needs.
const GOOD = Object.freeze({ action: 'publish', toolCommitPlain: true, toolReviewed: true, settingsRead: true, packageNamed: true,
  packagePrivate: false, versionPlain: true, packageKnown: true, tagExists: false, npmHasVersion: false, changelogFound: true,
  versionNewer: true, refIsMain: true });
const outcome = (facts) => {
  const result = plan({ facts });
  return result.refuse ? `${result.rule} -> refuse ${result.refuse}` : `${result.rule} -> ${result.mode} (compare ${result.compare})`;
};

for (const [change, expected] of [
  [{ toolCommitPlain: false, toolReviewed: null }, 'tool-commit-invalid -> refuse tool-commit-invalid'],
  [{ toolReviewed: false }, 'tool-not-reviewed -> refuse tool-not-reviewed'],
  [{ packageNamed: false }, 'package-unnamed -> refuse not-publishable'],
  [{ packagePrivate: true }, 'package-private -> refuse not-publishable'],
  [{ versionPlain: false, versionNewer: null, changelogFound: null }, 'version-not-plain -> refuse version-not-plain'],
  [{ packageKnown: false, npmHasVersion: null, versionNewer: null }, 'package-unknown -> refuse package-unknown'],
  [{ tagExists: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ settingsRead: null }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ action: 'prepare' }, 'facts-unreadable -> refuse fact-unreadable'],
  [{ tagExists: true, npmHasVersion: true }, 'released -> nothing (compare no)'],
  [{ tagExists: true, npmHasVersion: true, action: 'dry-run' }, 'dry-run-released -> dry-run (compare yes)'],
  [{ tagExists: true, npmHasVersion: false }, 'tag-without-package -> refuse tag-without-package'],
  [{ changelogFound: false }, 'changelog-missing -> refuse changelog-missing'],
  [{ changelogFound: false, npmHasVersion: true }, 'changelog-missing -> refuse changelog-missing'],
  [{ npmHasVersion: true, versionNewer: false }, 'recover -> recover (compare yes)'],
  [{ npmHasVersion: true, versionNewer: false, action: 'dry-run' }, 'dry-run-recover -> dry-run (compare yes)'],
  [{ versionNewer: false }, 'version-not-newer -> refuse version-not-newer'],
  [{ refIsMain: false }, 'publish-off-main -> refuse publish-off-main'],
  [{}, 'publish -> publish (compare yes)'],
  [{ action: 'dry-run', refIsMain: false }, 'dry-run-would-publish -> dry-run (compare no)'],
])
  test(`row: ${expected}`, () => assert.equal(outcome({ ...GOOD, ...change }), expected));

test('every row is reached by some case above, and every refusal a row names is in the table', () => {
  for (const rule of RULES) {
    assert.ok(rule.refuse === undefined || Object.hasOwn(REFUSALS, rule.refuse), rule.id);
    assert.ok(rule.refuse !== undefined || ['publish', 'recover', 'dry-run', 'nothing'].includes(rule.mode), rule.id);
    assert.ok(rule.refuse !== undefined || ['yes', 'no'].includes(rule.compare), rule.id);
    for (const [name, value] of Object.entries(rule.when))
      assert.ok(name === 'factsReadable' ? value === false : FACTS[name].includes(value), `${rule.id}: ${name}`);
  }
  assert.equal(new Set(RULES.map((rule) => rule.id)).size, RULES.length);
});

// Every combination of fact values in their domains.
function* combinations(names = Object.keys(FACTS), partial = {}) {
  if (names.length === 0) { yield { ...partial }; return; }
  const [first, ...rest] = names;
  for (const value of FACTS[first]) yield* combinations(rest, { ...partial, [first]: value });
}
const all = [...combinations()];

test('the table is total: every combination of readable facts meets a row', () => {
  assert.equal(all.length, 2 ** 12);
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

test('publish is chosen only when every gate holds', () => {
  for (const facts of all)
    if (plan({ facts }).mode === 'publish')
      assert.deepEqual({ ...facts }, { ...GOOD });
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
