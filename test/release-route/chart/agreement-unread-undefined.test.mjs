// The chart decides as plan.mjs does on every combination with one fact unknown or out of its
// domain, as the pure test enumerates it (one file per kind of bad value, so they run in parallel).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan } from '../../../src/release-route/plan.mjs';
import { FACTS } from '../../../src/release-route/rules.mjs';
import { chartDecides, combinations, oracle } from './agreement.mjs';

const BAD = { null: null, undefined: undefined, string: 'true', number: 1 }['undefined'];

test('chart and plan.mjs agree with any one fact undefined (65536 x 17 cases)', async () => {
  let count = 0;
  for (const facts of combinations())
    for (const name of Object.keys(FACTS)) {
      const odd = { ...facts, [name]: BAD };
      assert.equal(await chartDecides(odd), oracle(plan({ facts: odd })), JSON.stringify(odd));
      count++;
    }
  assert.equal(count, 2 ** 16 * 17);
});
