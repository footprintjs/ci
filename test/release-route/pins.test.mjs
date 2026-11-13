// Correction 5: both of a caller's files must pin the commit that is running (pins.mjs). The line
// rule on text, then the reader against a real repository (git's own ls-tree and cat-file), with the
// files a fork's pull request could write: odd names, hidden line breaks, links, big files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MAX_FILE_BYTES, MAX_FILES, routePins, workflowPins } from '../../src/release-route/pins.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { listAtCommit } from '../../src/release-route/repo.mjs';

const SHA = '67dc3738bfba1e8cdf960b0301450db6ff410692';
const ROUTE = 'footprintjs/ci/.github/workflows/release-route.yml';
const CHECK = 'footprintjs/ci/.github/workflows/release-check.yml';

test('the line rule: a `uses:` line naming release-route.yml or release-check.yml gives its pin; nothing else counts', () => {
  assert.deepEqual(routePins(`jobs:\n  release:\n    uses: ${ROUTE}@${SHA} # the reviewed ci commit\n`), [SHA]);
  assert.deepEqual(routePins(`  release-check:\n    uses: ${CHECK}@main\n`), ['main']);
  assert.deepEqual(routePins(`      - uses: ${CHECK}@v1\n`), ['v1'], 'a step form counts too (it only refuses more)');
  assert.deepEqual(routePins(`    uses: "${ROUTE}@${SHA}"\n    uses: '${CHECK}@x'\n`), [SHA, 'x'], 'one pair of quotes is read through');
  assert.deepEqual(routePins(`    uses: FootprintJS/CI/.github/workflows/release-route.yml@x\n`), ['x'], 'GitHub reads owner and repository in any case');
  // Not counted: a comment, the key in another position, another workflow, another repository.
  assert.deepEqual(routePins([`# uses: ${ROUTE}@x`, `    # uses: ${ROUTE}@x`, `    run: echo uses: ${ROUTE}@x`, `    uses: footprintjs/ci/.github/workflows/release.yml@x`,
    `    uses: other/ci/.github/workflows/release-route.yml@x`, `    uses: ./.github/workflows/release-route.yml`, `    with: { uses: ${ROUTE}@x }`].join('\n')), []);
});

test('a `uses:` line cannot hide behind a line break that is not a line feed, or a byte-order mark', () => {
  for (const ch of ['\r', '\r\n', '\u0085', '\u2028', '\u2029'])
    assert.deepEqual(routePins(`name: x${ch}    uses: ${ROUTE}@hidden${ch}`), ['hidden'], JSON.stringify(ch));
  assert.deepEqual(routePins(`\uFEFFuses: ${ROUTE}@first\n`), ['first']);
  assert.deepEqual(routePins(`\tuses:\t${ROUTE}@tab\n`), ['tab']);
});

function repo(t, files, { links = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'route-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  run('init', '--quiet', '-b', 'main');
  run('config', 'user.name', 'Route test');
  run('config', 'user.email', 'route@example.invalid');
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(join(root, 'README.md'), 'x');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, '.github/workflows', name, '..'), { recursive: true });
    writeFileSync(join(root, '.github/workflows', name), text);
  }
  for (const [name, target] of Object.entries(links)) symlinkSync(target, join(root, '.github/workflows', name));
  run('add', '.');
  run('commit', '--quiet', '-m', 'start');
  return { commit: run('rev-parse', 'HEAD').toString().trim(), git: (args) => run(...args) };
}
const answer = (fn) => {
  try { return fn(); } catch (error) { const r = asRefusal(error); return `${r.code}${r.detail ? ` ${r.detail}` : ''}`; }
};

test('through git: both files at the commit running agree; one file elsewhere is named, with the pin it found', (t) => {
  const publish = `jobs:\n  release:\n    uses: ${ROUTE}@${SHA} # the reviewed ci commit\n`;
  const ok = repo(t, { 'publish.yml': publish, 'ci.yaml': `jobs:\n  release-check:\n    uses: ${CHECK}@${SHA}\n`, 'notes.txt': `uses: ${ROUTE}@x\n` });
  assert.deepEqual(workflowPins(ok.git, ok.commit, SHA), { agree: true });
  const bad = repo(t, { 'publish.yml': publish, 'ci.yml': `jobs:\n  release-check:\n    uses: ${CHECK}@${'b'.repeat(40)}\n` });
  assert.deepEqual(workflowPins(bad.git, bad.commit, SHA), { agree: false, file: 'ci.yml', pin: 'b'.repeat(40) });
  // A file that names neither workflow says nothing; no workflows folder at all agrees.
  const none = repo(t, {});
  assert.deepEqual(workflowPins(none.git, none.commit, SHA), { agree: true });
});

test('through git: only the folder itself counts (GitHub reads no subfolder), any letter case of .yml/.yaml counts', (t) => {
  const r = repo(t, { 'sub/x.yml': `uses: ${ROUTE}@x\n`, 'UPPER.YML': `uses: ${ROUTE}@upper\n` });
  assert.deepEqual(workflowPins(r.git, r.commit, SHA), { agree: false, file: 'UPPER.YML', pin: 'upper' });
});

test('through git: a file name with pattern characters is read by its blob, never used as a pathspec', (t) => {
  const r = repo(t, { '*.yml': `uses: ${ROUTE}@star\n`, 'a.yml': `uses: ${ROUTE}@${SHA}\n` });
  assert.deepEqual(workflowPins(r.git, r.commit, SHA), { agree: false, file: '*.yml', pin: 'star' });
});

test('through git: a link is unreadable (never followed), so is a file over the bound; a folder of too many files is unreadable', (t) => {
  const linked = repo(t, { 'real.txt': `uses: ${ROUTE}@${SHA}\n` }, { links: { 'publish.yml': 'real.txt' } });
  assert.equal(answer(() => workflowPins(linked.git, linked.commit, SHA)), 'workflows-unreadable publish.yml');
  const big = repo(t, { 'big.yml': `${'#'.repeat(MAX_FILE_BYTES)}\n` });
  assert.equal(answer(() => workflowPins(big.git, big.commit, SHA)), 'workflows-unreadable big.yml');
  const many = repo(t, Object.fromEntries(Array.from({ length: MAX_FILES + 1 }, (_, i) => [`w${i}.yml`, 'on: push\n'])));
  assert.equal(answer(() => workflowPins(many.git, many.commit, SHA)), `workflows-unreadable more than ${MAX_FILES} entries in .github/workflows`);
});

test('nothing of a file but its cleaned name and the cleaned pin leaves the reader', (t) => {
  const r = repo(t, { 'a\u202Eb.yml': `uses: ${ROUTE}@::set-output\u202Ename=x::y\nsecret: do-not-print\n` });
  const found = workflowPins(r.git, r.commit, SHA);
  assert.deepEqual(found, { agree: false, file: 'ab.yml', pin: ': :set-outputname=x: :y' });
  assert.doesNotMatch(JSON.stringify(found), /do-not-print/);
  const long = repo(t, { 'l.yml': `uses: ${ROUTE}@${'p'.repeat(500)}\n` });
  assert.equal(workflowPins(long.git, long.commit, SHA).pin, `${'p'.repeat(80)}...`);
});

test('a listing that is not git\'s shape is git-failed, never guessed', () => {
  const commit = 'c'.repeat(40);
  const listing = (text) => () => Buffer.from(text);
  for (const text of ['garbage', '100644 blob x\t.github/workflows/a.yml\0', `100644 blob ${'a'.repeat(40)}\t.github/other/a.yml\0`,
    `100644 blob ${'a'.repeat(40)}\t.github/workflows/sub/a.yml\0`, `100644 blob ${'a'.repeat(40)}\t.github/workflows/a.yml`])
    assert.equal(answer(() => listAtCommit(listing(text), commit, '.github/workflows', 10, 'workflows-unreadable')), 'git-failed ls-tree .github/workflows', text);
  assert.deepEqual(listAtCommit(listing(''), commit, '.github/workflows', 10, 'workflows-unreadable'), []);
  assert.equal(answer(() => workflowPins(listing(''), commit, 'main')), 'input-invalid tool commit');
});
