// The one bound for a refusal's detail wherever it is shown or kept (step-common.mjs · shownDetail):
// 200 characters, counted in characters; a longer detail is cut there and marked with "...", so the
// longest shown detail is 203 characters.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Refusal } from '../../src/release-route/refusals.mjs';
import { shownDetail, shownRefusal } from '../../src/release-route/step-common.mjs';

test('a detail of exactly 200 characters is shown whole', () => {
  const detail = 'd'.repeat(199) + '\u{1F600}';
  assert.equal(shownDetail(detail), detail);
  assert.equal(shownRefusal(new Refusal('git-failed', detail)).detail, detail);
});

test('a detail over 200 characters is cut at 200 and marked', () => {
  const detail = 'd'.repeat(200) + 'SECRET-TAIL';
  assert.equal(shownDetail(detail), `${'d'.repeat(200)}...`);
  assert.equal(shownRefusal(new Refusal('git-failed', detail)).detail, `${'d'.repeat(200)}...`);
});
