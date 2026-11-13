// The sentences of docs/RELEASE-ROUTE.md that the second reader found untrue or missing (round 1:
// N2, N3, N6 and its first-dry-run checklist; round 2: N9 to N12 and the checklist's artifact item),
// and those the first real runs proved wrong (corrections 3, 4 and 9 of the follow-up). Prose is not code, so this pins only what must
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
  // Correction 7: no longer `released`: a tag without its GitHub release is unfinished work.
  assert.doesNotMatch(row, /`released`, nothing to do/);
  assert.match(row, /plans `finish`: the release job alone writes the release for the existing tag/);
  assert.match(row, /refused `tag-elsewhere` \(rule `finish-tag-elsewhere`\)/);
  assert.match(row, /"Re-run failed jobs" on the run that failed, within GitHub's re-run window/);
  assert.match(row, /by hand/);
});

test('N3: never "Re-run all jobs" after the build turned green', () => {
  assert.doesNotMatch(section, /re-run the whole run/);
  assert.match(flat, /never "Re-run all jobs" on that run/);
});

// Correction 3, measured on storydeck run 43334890647: "Re-run all jobs" uploaded the package again
// with no error and GitHub then deleted every artifact of the earlier attempts. The doc said the
// second upload fails on the name and that nothing can replace the first file; both were false.
test('correction 3: the artifact rows say what was measured across attempts, and the false sentences are gone', () => {
  for (const gone of [/expected to fail on the name/, /nothing can replace/, /not known until the first dry run/, /does it get a 409 Conflict\?/])
    assert.doesNotMatch(flat, gone);
  const pkg = rows.find((line) => line.startsWith('| `release-route-package`'));
  assert.match(pkg, /measured on storydeck run 43334890647, attempt 2/);
  assert.match(pkg, /as long as nobody pressed "Re-run all jobs" on that run/);
  for (const fact of [/uploaded `release-route-package` again with NO error/, /answered 404 for every artifact of the earlier attempts/,
    /a full re-run plans again from fresh facts/, /verify refuses any package that differs from what npm serves/,
    /deletes the only kept copy of the bytes npm received and that attempt's plan and verify records/,
    /"Re-run failed jobs on the original run" no longer works for that run/, /never "Re-run all jobs" after the build of a run was green/])
    assert.match(flat, fact);
  const row = rows.find((line) => line.startsWith('| Version merged, not published'));
  assert.match(row, /GitHub deletes every artifact of the earlier attempts/);
});

// Correction 4: a dry run has its own concurrency group, so it cannot cancel a waiting release.
test('correction 4: W11 and the adoption notes say a dry run has its own group; "Harmless: the newest run plans the tip" is gone', () => {
  const whole = doc.replace(/\s+/g, ' ');
  assert.doesNotMatch(whole, /Harmless: the newest run plans the tip/);
  assert.match(whole, /a dry run never cancels a waiting release/);
  assert.match(whole, /a manual dry run queued behind a running release cancelled a release push still waiting/);
});

// Correction 9: where the hold is described, it says it stops a publish and not a recover.
test('correction 9: the hold stops a publish, not a recover or a finish, said where the hold is described', () => {
  const whole = doc.replace(/\s+/g, ' ');
  assert.match(whole, /A hold stops a publish only: `recover` and `finish` do not ask it, because they tag and release a version npm already serves/);
  assert.match(whole, /\| hold \| mode `publish` or `dry-run` \(not `recover` or `finish`: a hold stops a publish, not the tag and release of a version npm already serves\)/);
  assert.match(whole, /It does not stop `recover` or `finish`/);
});

test('B1: the re-run rows say the publish job measures again', () => {
  const hold = rows.find((line) => line.startsWith('| A hold set after the merge'));
  assert.match(hold, /`plan-stale`/);
  assert.doesNotMatch(section, /\| Any re-run \|/);
});

test('N6: the four facts an adopter needs, and the first runs\' checklist', () => {
  for (const fact of [/the runner image's cached 22\.x when it has one, not always the newest/, /start no `push: tags` or `release` workflow/,
    /cancels a PENDING run of the same group/, /ends `registry-late`: red for the right reason/])
    assert.match(flat, fact);
  const checklist = flat.slice(flat.indexOf('### The first runs'));
  assert.ok(checklist.length > 0 && section.includes('### The first runs'), 'the checklist section');
  for (const item of ['job.workflow_sha', './tool/.github/actions/hold', 'release-route-package', 'Re-run failed jobs', 'Re-run all jobs',
    'trusted publisher', 'ls-remote', 'tag', 'timeout-minutes', 'record', 'git config', 'draft', 'Latest', 'make_latest'])
    assert.ok(checklist.includes(item), item);
});

// Round 2 (N9 to N12): sentences that were not exactly true, or missing.
test('N9: the hold row says what a person does, not that "the newer run\'s plan decides"', () => {
  assert.doesNotMatch(section, /newer run's plan decides/);
  const hold = rows.find((line) => line.startsWith('| A hold set after the merge'));
  assert.match(hold, /start a new run from `main` \(a push, or a dispatch\)/);
});

test('N11: a merge into main while a release runs makes that run refuse plan-stale (red by design); the new tip\'s run publishes', () => {
  const row = rows.find((line) => line.startsWith('| A merge into `main` while a release is running'));
  assert.ok(row, 'a row for it');
  assert.match(row, /`plan-stale`/);
  assert.match(row, /publish job/);
  assert.match(row, /red by design/);
  assert.match(row, /the run of the new tip publishes/);
});

test('N12 and the checklist: what the first runs proved and what is still open are marked, with the runs named', () => {
  const checklist = flat.slice(flat.indexOf('### The first runs'), flat.indexOf('## Not built yet'));
  const proved = checklist.slice(checklist.indexOf('**Proved there:**'), checklist.indexOf('**Still open, for a later real run:**'));
  const open = checklist.slice(checklist.indexOf('**Still open, for a later real run:**'));
  assert.ok(proved.length > 100 && open.length > 100);
  for (const run of ['43331791589', '43334890647', '43336400518', '43338729924']) assert.match(checklist, new RegExp(run));
  for (const item of [/`job\.workflow_sha` is filled/, /`release-route-package` crosses jobs/, /"Re-run failed jobs" \(attempt 2\)/, /"Re-run all jobs" \(attempt 3\)/,
    /The OIDC publish with the vendored npm and provenance from the CALLED workflow/i, /tag POST and `gh release create` with the job's token/])
    assert.match(proved, item);
  for (const item of [/beside an existing draft with the same tag/, /`timeout-minutes`/, /"Latest" when an older version is released after a newer one/,
    /`make_latest` defaults to `true`/, /What `actions\/checkout` writes to git config/])
    assert.match(open, item);
  assert.doesNotMatch(checklist, /There is no real run yet/);
});
