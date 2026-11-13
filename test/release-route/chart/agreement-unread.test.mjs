// The chart hands an UNREADABLE fact to the same decision as plan.mjs, unchanged. This one file
// replaces four (agreement-unread-{null,undefined,string,number}), which ran the whole chart on all
// 65,536 combinations x 17 facts x one bad kind each: 4.46 million chart runs, minutes per CI job
// (review of pull request 22, tests-2). The proof is the same, in three parts that are each cheap:
//
// What the exhaustive chart walk established, and where each part of it now lives:
// 1. The decide stage picks the row plan.mjs picks on every READABLE combination:
//    agreement-readable.test.mjs, still exhaustive (65,536 chart runs).
// 2. plan.mjs refuses with any one fact unknown or out of its domain, on every combination and in
//    every bad kind: plan.test.mjs "fail closed", exhaustive (65,536 x 17 x 4, the pure function).
// 3. The chart's own part between the facts and the decision: (a) the weigh stage computes
//    `factsReadable` exactly as plan.mjs · seenFacts does, and leaves the fact as it is (null for
//    undefined); (b) the engine carries the bad value to decide() unchanged, and decide()'s rules
//    (equality tests, first match) treat it as plan.mjs · matches does.
//
// Part 3 is what this file holds, so the three together say what the old walk said:
// - (a) runs the weigh stage's own function (stages/weigh.mjs, the one the chart runs) on EVERY
//   combination with EVERY fact made unreadable in EVERY bad kind (4.46 million calls of a pure
//   function, no engine), and on every readable combination. A weigh that special-cased a pattern
//   of the other facts (the review's mutant CM3: "readable" forced when tagExists=false,
//   refIsMain=true and action=dry-run) is caught here, which a walk over a few witnesses cannot
//   promise.
// - (b) runs the whole chart on one WITNESS of every row (the first combination, in the pure
//   test's order, that plan.mjs decides by that row), with every fact made unreadable in each bad
//   kind and every one-fact change to the fact's other values. Why witnesses are enough here:
//   decide() tests each row as a conjunction of equalities over named facts and takes the first
//   row that holds (decide.mjs hands it rules.mjs unchanged); a bad value can change the answer
//   only through the one fact it sits in, by matching (or failing) an equality on it, and every row
//   that names that fact is reached from its own witness with that fact made bad. How the engine
//   carries a value (null, undefined dropped, the string 'true', the number 1) does not depend on
//   the values of the other facts, so one witness per row shows it for that row's tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEIGH } from '../../../src/release-route/chart/stages/weigh.mjs';
import { plan, seenFacts } from '../../../src/release-route/plan.mjs';
import { FACTS, RULES } from '../../../src/release-route/rules.mjs';
import { chartDecides, combinations, oracle } from './agreement.mjs';

const BADS = [null, undefined, 'true', 1];
const NAMES = Object.keys(FACTS);
const all = [...combinations()];

test('(a) the weigh stage reads every fact as plan.mjs does: every combination, every fact unreadable in every bad kind', () => {
  const weigh = WEIGH.make();
  let count = 0;
  // Plain comparisons, asserted only on a difference: 4.46 million cases.
  const check = (facts) => {
    const scope = { ...facts };
    weigh(scope);
    let same = scope.factsReadable === seenFacts(facts).factsReadable;
    for (const name of NAMES) same &&= scope[name] === (facts[name] === undefined ? null : facts[name]);
    if (!same) assert.fail(`weigh differs from seenFacts on ${JSON.stringify(facts)}: ${JSON.stringify(scope)}`);
    count++;
  };
  for (const facts of all) {
    check(facts);
    for (const name of NAMES) {
      const saved = facts[name];
      for (const bad of BADS) {
        facts[name] = bad;
        check(facts);
      }
      facts[name] = saved;
    }
  }
  assert.equal(count, 2 ** 16 * (1 + NAMES.length * BADS.length));
});

// One witness per row: the first combination plan.mjs decides by it.
const witnesses = RULES.filter((rule) => rule.when.factsReadable === undefined).map((rule) => {
  const facts = all.find((candidate) => plan({ facts: candidate }).rule === rule.id);
  return [rule.id, facts];
});

test('(b) the chart decides as plan.mjs does on a witness of every row: each fact unreadable in each bad kind, and each one-fact change', async () => {
  // Every row but facts-unreadable (no readable combination reaches it) has a witness.
  assert.deepEqual(witnesses.filter(([, facts]) => !facts).map(([id]) => id), []);
  assert.equal(witnesses.length, RULES.length - 1);
  let count = 0;
  for (const [id, facts] of witnesses) {
    const cases = [facts];
    for (const name of NAMES) {
      for (const bad of BADS) cases.push({ ...facts, [name]: bad });
      for (const other of FACTS[name]) if (other !== facts[name]) cases.push({ ...facts, [name]: other });
    }
    for (const odd of cases) {
      assert.equal(await chartDecides(odd), oracle(plan({ facts: odd })), `${id}: ${JSON.stringify(odd)}`);
      count++;
    }
  }
  // 26 witnesses x (1 + 17 x 4 bad values + 16 facts with a second value).
  assert.equal(count, witnesses.length * (1 + NAMES.length * BADS.length + NAMES.filter((name) => FACTS[name].length > 1).length));
});
