// The chart hands an UNREADABLE fact to the same decision as plan.mjs, unchanged. This one file
// replaces four (agreement-unread-{null,undefined,string,number}), which ran the whole chart on all
// 65,536 combinations x 17 facts x one bad kind each: 4.46 million chart runs, minutes per CI job
// (review of pull request 22, tests-2). It runs three parts, each cheap enough for every CI job.
//
// What the files hold together (each exhaustive walk is named as such; nothing else is):
// - agreement-readable.test.mjs: on EVERY readable combination (65,536 chart runs) the chart
//   decides as plan.mjs does: the same rule, mode, compare and refusal.
// - plan.test.mjs "fail closed": plan.mjs refuses with any one fact unknown or out of its domain, on
//   every combination and in every bad kind (65,536 x 17 x 4, the pure function, no chart).
// - (a) below: the weigh stage's own function (stages/weigh.mjs, the one the chart runs) on EVERY
//   combination, readable and with EVERY fact made unreadable in EVERY bad kind (65,536 x 69 =
//   4,521,984 calls of a pure function, no engine), computes `factsReadable` exactly as
//   plan.mjs · seenFacts does and leaves each fact as it is (null for undefined). A weigh that
//   special-cased a pattern of the other facts (the review's mutant CM3: "readable" forced when
//   tagExists=false, refIsMain=true and action=dry-run) is caught here.
// - (b) below: the whole chart on one WITNESS of every row (the first combination, in the pure
//   test's order, that plan.mjs decides by that row), with every fact made unreadable in each bad
//   kind and every one-fact change to the fact's other values (26 x 85 = 2,210 chart runs). It
//   shows, for the tests of every row, that the engine carries each bad value (null, undefined
//   dropped, the string 'true', the number 1) to decide() unchanged and that decide() treats it as
//   plan.mjs · matches does.
// - (c) below: the whole chart on EVERY combination once, with one fact made unreadable; the fact
//   and its bad kind rotate with the combination's index i (fact NAMES[i % 17], kind
//   BADS[floor(i / 17) % 4]), 65,536 chart runs. It is what catches a decide stage that departs
//   from decide(RULE_FILTERS) on a pattern of OTHER facts, which no witness need hit: the review's
//   DM2 (a dry run off main skips facts-unreadable) and DM4 (no tag, tagAtCommit and releaseExists
//   false, skips it) passed (a), (b) and the readable walk, and fail here.
//
// What they do not hold: the whole chart on every (combination, fact, bad kind) triple, which is
// what the four files ran. A decide stage that departs only for one fact in one bad kind, on a
// pattern of the other facts that neither a witness nor the rotation pairs with that fact and
// kind, would pass all three parts.
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
  // Plain comparisons, asserted only on a difference: 65,536 x 69 = 4,521,984 cases.
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

test('(c) the whole chart decides as plan.mjs does on every combination once, one fact unreadable (the fact and its bad kind rotate)', async () => {
  let i = 0;
  for (const facts of all) {
    const odd = { ...facts, [NAMES[i % NAMES.length]]: BADS[Math.floor(i / NAMES.length) % BADS.length] };
    const chart = await chartDecides(odd);
    const expected = oracle(plan({ facts: odd }));
    // Asserted only on a difference: 65,536 chart runs.
    if (chart !== expected) assert.fail(`chart ${chart}, plan.mjs ${expected}: ${JSON.stringify(odd)}`);
    i++;
  }
  assert.equal(NAMES.length, 17);
  assert.equal(i, 2 ** 16);
});
