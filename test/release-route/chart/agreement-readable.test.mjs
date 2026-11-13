// The chart decides as plan.mjs does on EVERY combination of readable facts (65536).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan } from '../../../src/release-route/plan.mjs';
import { chartDecides, combinations, oracle } from './agreement.mjs';

test('chart and plan.mjs agree on all 65536 combinations of readable facts', async () => {
  let count = 0;
  for (const facts of combinations()) {
    assert.equal(await chartDecides(facts), oracle(plan({ facts })), JSON.stringify(facts));
    count++;
  }
  assert.equal(count, 2 ** 16);
});
