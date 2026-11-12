// The sentences of docs/RELEASE-ROUTE.md that the second reader found untrue or missing (round 1:
// N2, N3, N6 and its first-dry-run checklist). Prose is not code, so this pins only what must
// never come back (a false row) and that each missing fact is said, in the section people read.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const doc = readFileSync('docs/RELEASE-ROUTE.md', 'utf8');
const section = doc.slice(doc.indexOf('## The workflows'), doc.indexOf('## Not built yet'));
const rows = section.split('\n').filter((line) => line.startsWith('| '));
// Prose as one line, so a sentence wrapped across lines still matches.
const flat = section.replace(/\s+/g, ' ');

test('N2: a tag made and a release failed is not called a recover; the remedy that works is named', () => {
  assert.equal(rows.some((row) => /the tag or the release failed/.test(row)), false, 'the false row is gone');
  const row = rows.find((line) => /the GitHub release failed/.test(line));
  assert.ok(row, 'a row for a tag made and a release failed');
  assert.match(row, /`released`, nothing to do/);
  assert.match(row, /"Re-run failed jobs" on the run that failed, within GitHub's re-run window/);
  assert.match(row, /by hand/);
});

test('N3: never "Re-run all jobs" after the build turned green', () => {
  assert.doesNotMatch(section, /re-run the whole run/);
  assert.match(flat, /never "Re-run all jobs" on that run/);
  assert.match(flat, /not known until the first dry run/);
});

test('B1: the re-run rows say the publish job measures again', () => {
  const hold = rows.find((line) => line.startsWith('| A hold set after the merge'));
  assert.match(hold, /`plan-stale`/);
  assert.doesNotMatch(section, /\| Any re-run \|/);
});

test('N6: the four facts an adopter needs, and the first dry run\'s checklist', () => {
  for (const fact of [/newest minor of the major the settings name/, /start no `push: tags` or `release` workflow/,
    /cancels a PENDING run of the same group/, /ends `registry-late`: red for the right reason/])
    assert.match(flat, fact);
  const checklist = flat.slice(flat.indexOf('### The first dry run'));
  assert.ok(checklist.length > 0 && section.includes('### The first dry run'), 'the checklist section');
  for (const item of ['job.workflow_sha', './tool/.github/actions/hold', 'release-route-package', 'Re-run failed jobs', 'Re-run all jobs',
    'trusted publisher', 'ls-remote', 'tag', 'timeout-minutes', 'record', 'git config', 'draft'])
    assert.ok(checklist.includes(item), item);
});
