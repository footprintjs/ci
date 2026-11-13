// Correction 5: both of a caller's files must pin the commit that is running (pins.mjs). The line
// rule on text, then the reader against a real repository (git's own ls-tree and cat-file), with the
// files a fork's pull request could write: odd names, hidden line breaks, links, big files.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { MAX_FILE_BYTES, MAX_FILES, routeMentions, routePins, workflowPins } from '../../src/release-route/pins.mjs';
import { recordedGit } from './recorded-git.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { listAtCommit } from '../../src/release-route/repo.mjs';

const SHA = '67dc3738bfba1e8cdf960b0301450db6ff410692';
const ROUTE = 'footprintjs/ci/.github/workflows/release-route.yml';
const CHECK = 'footprintjs/ci/.github/workflows/release-check.yml';
const COMMIT = 'c'.repeat(40);

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

test('a `uses:` line cannot hide behind a lone carriage return, or a byte-order mark', () => {
  for (const ch of ['\r', '\r\n'])
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
  // A file that names neither workflow says nothing; but no route pin anywhere is unreadable (the
  // workflow that is running names the route, so the reader missed it).
  const none = repo(t, {});
  assert.equal(answer(() => workflowPins(none.git, none.commit, SHA)), 'workflows-unreadable no route pin in .github/workflows');
  const noPin = repo(t, { 'ci.yml': 'on: push\njobs:\n  test:\n    runs-on: ubuntu-24.04\n' });
  assert.equal(answer(() => workflowPins(noPin.git, noPin.commit, SHA)), 'workflows-unreadable no route pin in .github/workflows');
});

// The review's three cases (pins-reader-3): the second file is read, two pins in one file are both
// read, and a folder is never read.
test('through git: the second file is read; two pins in one file are both read; a folder is never read', (t) => {
  const second = repo(t, { 'a.yml': `uses: ${ROUTE}@${SHA}\n`, 'z.yml': `uses: ${CHECK}@main\n` });
  assert.deepEqual(workflowPins(second.git, second.commit, SHA), { agree: false, file: 'z.yml', pin: 'main' });
  const two = repo(t, { 'a.yml': `uses: ${ROUTE}@${SHA}\nuses: ${CHECK}@main\n` });
  assert.deepEqual(workflowPins(two.git, two.commit, SHA), { agree: false, file: 'a.yml', pin: 'main' });
  const folder = repo(t, { 'a.yml': `uses: ${ROUTE}@${SHA}\n`, 'x.yml/inner.yml': `uses: ${ROUTE}@main\n` });
  assert.deepEqual(workflowPins(folder.git, folder.commit, SHA), { agree: true });
  // A folder named x.yml with nothing else: no pin read at all (not "unreadable x.yml").
  const only = repo(t, { 'x.yml/y.yml': `uses: ${ROUTE}@x\n` });
  assert.equal(answer(() => workflowPins(only.git, only.commit, SHA)), 'workflows-unreadable no route pin in .github/workflows');
});

test('through git: a .yaml file pinning another commit is named, like a .yml one', (t) => {
  const r = repo(t, { 'publish.yml': `uses: ${ROUTE}@${SHA}\n`, 'release-check.yaml': `jobs:\n  release-check:\n    uses: ${CHECK}@main\n` });
  assert.deepEqual(workflowPins(r.git, r.commit, SHA), { agree: false, file: 'release-check.yaml', pin: 'main' });
});

// Correction B of the review: a route pin spelled any way but a plain `uses: <value>` line is not
// read by the line rule, so it must refuse, never count as agreeing. Each form below is valid YAML
// that gives GitHub the pin `bbbb...` (pins-reader-1's list, checked with a YAML parser there); a
// plain `uses:` line pinning the commit running sits in another file, as in a real caller.
const B = 'b'.repeat(40);
const UNREAD_FORMS = {
  'folded block scalar': `jobs:\n  release:\n    uses: >-\n      ${ROUTE}@${B}\n`,
  'literal block scalar': `jobs:\n  release:\n    uses: |-\n      ${ROUTE}@${B}\n`,
  'the value on the next line': `jobs:\n  release:\n    uses:\n      ${ROUTE}@${B}\n`,
  'a flow mapping': `jobs:\n  release: { uses: ${ROUTE}@${B} }\n`,
  'a flow sequence of mappings': `x: [ { uses: ${ROUTE}@${B} } ]\n`,
  'a double-quoted key': `jobs:\n  release:\n    "uses": ${ROUTE}@${B}\n`,
  'a single-quoted key': `jobs:\n  release:\n    'uses': ${ROUTE}@${B}\n`,
  'a space before the colon': `jobs:\n  release:\n    uses : ${ROUTE}@${B}\n`,
  'an anchor': `jobs:\n  release:\n    uses: &r ${ROUTE}@${B}\n`,
  'an alias': `x: &r ${ROUTE}@${B}\njobs:\n  release:\n    uses: *r\n`,
  'a !!str tag': `jobs:\n  release:\n    uses: !!str ${ROUTE}@${B}\n`,
  'a complex key': `jobs:\n  release:\n    ? uses\n    : ${ROUTE}@${B}\n`,
  'a double-quoted value split over two lines': `jobs:\n  release:\n    uses: "${ROUTE}@bbbb\n      ${B.slice(4)}"\n`,
  'a folded value split inside the path': `jobs:\n  release:\n    uses: >-\n      footprintjs/ci/.github/workflows/release-\n      route.yml@${B}\n`,
  'a JSON workflow file': JSON.stringify({ name: 'publish', jobs: { release: { uses: `${ROUTE}@${B}` } } }),
  'a mention in a run script': `jobs:\n  x:\n    steps:\n      - run: echo uses: ${ROUTE}@${B}\n`,
  'a mention in a with value': `jobs:\n  x:\n    with: { uses: ${ROUTE}@${B} }\n`,
  'an upper-case owner in a flow mapping': `jobs:\n  release: { uses: FootprintJS/CI/.github/workflows/release-route.yml@${B} }\n`,
  // Round 3 (review round 2, pins-1): a `#` inside a quoted value is text, not a comment, so the
  // rest of its line still counts.
  'a one-line JSON file with "PR #checks"': JSON.stringify({ name: 'PR #checks', on: 'pull_request', jobs: { 'release-check': { uses: `${CHECK}@${B}` } } }),
  'a flow mapping with "Release check #2"': `on: pull_request\njobs:\n  release-check: { name: "Release check #2", uses: ${CHECK}@${B} }\n`,
  "a flow mapping with 'Release check #2'": `on: pull_request\njobs:\n  release-check: { name: 'Release check #2', uses: ${CHECK}@${B} }\n`,
  'a flow mapping with a tab before the #': `on: pull_request\njobs:\n  release-check: { name: "Release check\t#2", uses: ${CHECK}@${B} }\n`,
  'a with value after "x #y"': `jobs:\n  r:\n    with: { note: "x #y", other: ${ROUTE}@${B} }\n`,
  'a uses-led line whose quoted value holds " #"': `jobs: { r: { with: {\n  uses: "a #" }, uses: ${ROUTE}@${B} } }\n`,
  // pins-2: an escaped slash, as some JSON writers emit it.
  'a JSON file with escaped slashes': JSON.stringify({ name: 'publish', jobs: { release: { uses: `${ROUTE}@${B}` } } }).replaceAll('/', '\\/'),
};

test('every spelling of a route pin the line rule does not read refuses workflows-unreadable, naming the file', () => {
  for (const [form, text] of Object.entries(UNREAD_FORMS)) {
    assert.ok(routeMentions(text) > routePins(text).length, form);
    const files = { '.github/workflows/a.yml': Buffer.from(`uses: ${ROUTE}@${SHA}\n`), '.github/workflows/odd.yml': Buffer.from(text) };
    const { git } = recordedGit({ commit: COMMIT, files });
    assert.equal(answer(() => workflowPins(git, COMMIT, SHA)), 'workflows-unreadable odd.yml: a route pin not on a plain uses line', form);
  }
});

test('comments never count: a plain pin with a comment that names another pin agrees; a commented-out pin is nothing', () => {
  for (const text of [`uses: ${ROUTE}@${SHA} # was ${ROUTE}@main\n`, `uses: ${ROUTE}@${SHA}\t# was ${ROUTE}@main\n`, `# uses: ${ROUTE}@main\nuses: ${ROUTE}@${SHA}\n`,
    `#${ROUTE}@main\nuses: ${ROUTE}@${SHA}\n`, `\t # ${CHECK}@main\n  - uses: "${CHECK}@${SHA}" # reviewed\n`, `  - uses: '${CHECK}@${SHA}'\t#${CHECK}@main\n`]) {
    assert.equal(routeMentions(text), routePins(text).length, text);
    const { git } = recordedGit({ commit: COMMIT, files: { '.github/workflows/a.yml': Buffer.from(text) } });
    assert.deepEqual(workflowPins(git, COMMIT, SHA), { agree: true }, text);
  }
  // A `#` with no white space before it is not a comment (YAML's rule), so the mention counts.
  assert.equal(routeMentions(`x: y#${ROUTE}@main\n`), 1);
});

// The cost the header names: only what is CERTAINLY a comment is removed, so a mention of the path
// with `@` in a trailing comment on any other line refuses, even when the file's pins agree.
test('the accepted cost: a route mention in a trailing comment that is not right after a plain pin refuses', () => {
  for (const text of [`uses: ${CHECK}@${SHA}\nother:\n  steps:\n    - run: echo hi # see ${CHECK}@main\n`,
    `uses: ${CHECK}@${SHA}\nname: release # ${CHECK}@main\n`, `uses: a b # ${CHECK}@main\nuses: ${CHECK}@${SHA}\n`]) {
    const { git } = recordedGit({ commit: COMMIT, files: { '.github/workflows/a.yml': Buffer.from(text) } });
    assert.equal(answer(() => workflowPins(git, COMMIT, SHA)), 'workflows-unreadable a.yml: a route pin not on a plain uses line', text);
  }
});

// Characters an honest workflow file does not hold (the header): YAML 1.1 ends a line at NEL, LS
// and PS and YAML 1.2 does not, so a `#` after one may or may not start a line; a UTF-16 file
// decodes to nothing the line rule sees. Each refuses with its reason, beside a plain pin that
// agrees. The line-break forms are a pin the old reader missed: it split the line at the character
// and dropped `#, uses: ...` as a comment line.
test('a file with NEL, LS, PS or NUL, or not UTF-8 (UTF-16 with either mark), refuses workflows-unreadable with the reason', () => {
  const unusual = 'workflows-unreadable odd.yml: an unusual line-break character';
  const cases = [
    [`jobs:\n  r: { name: x\u{85}#, uses: ${CHECK}@main }\n`, unusual],
    [`jobs:\n  r: { name: x\u{2028}#, uses: ${CHECK}@main }\n`, unusual],
    [`jobs:\n  r: { name: x\u{2029}#, uses: ${CHECK}@main }\n`, unusual],
    [`jobs:\n  r:\n    uses: ${CHECK}@${SHA}\0\n`, 'workflows-unreadable odd.yml: a NUL character'],
  ];
  const other = `jobs:\n  r:\n    uses: ${CHECK}@main\n`;
  const utf16le = Buffer.from(other, 'utf16le');
  const files = (bytes) => ({ '.github/workflows/a.yml': Buffer.from(`uses: ${ROUTE}@${SHA}\n`), '.github/workflows/odd.yml': bytes });
  for (const [text, expected] of cases) {
    const { git } = recordedGit({ commit: COMMIT, files: files(Buffer.from(text)) });
    assert.equal(answer(() => workflowPins(git, COMMIT, SHA)), expected, JSON.stringify(text));
  }
  for (const [label, bytes, expected] of [
    ['UTF-16 LE with its mark', Buffer.concat([Buffer.from([0xff, 0xfe]), utf16le]), 'workflows-unreadable odd.yml: not UTF-8 text'],
    ['UTF-16 BE with its mark', Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(utf16le).swap16()]), 'workflows-unreadable odd.yml: not UTF-8 text'],
    ['UTF-16 LE without a mark', utf16le, 'workflows-unreadable odd.yml: a NUL character'],
  ]) {
    const { git } = recordedGit({ commit: COMMIT, files: files(bytes) });
    assert.equal(answer(() => workflowPins(git, COMMIT, SHA)), expected, label);
  }
});

// What the header says is NOT caught, pinned so the header and the code cannot drift apart: a line
// inside a quoted value written over several lines that starts with `#`, or with `uses:` and a
// value followed by ` #`, is read as if it stood outside the quotes; an escape other than `\/`
// inside a quoted value hides the path. Each text below gives GitHub a pin at `main` and reads here
// as no mention at all. If one starts to count, the reader got better: move it into UNREAD_FORMS.
test('known gaps (the header): a #- or uses:-led line inside a multi-line quoted value, an escape other than \\/', () => {
  for (const text of [`jobs: { r: { name: "a\n  # ", uses: ${CHECK}@main } }\n`, `jobs: { r: { name: "a\n  uses: x # ", uses: ${CHECK}@main } }\n`,
    `jobs:\n  r:\n    uses: "footprintjs/ci/.github/workflows/release-check\\x2eyml@main"\n`])
    assert.deepEqual([routePins(text), routeMentions(text)], [[], 0], text);
});

test('storydeck\'s two real caller files (main d7eef62) give one pin each and agree; its ci.yml gives none', () => {
  const real = (name) => readFileSync(new URL(`fixtures/storydeck-workflows/${name}`, import.meta.url), 'utf8');
  for (const name of ['publish.yml', 'release-check.yml']) {
    assert.deepEqual(routePins(real(name)), ['67dc3738bfba1e8cdf960b0301450db6ff410692'], name);
    assert.equal(routeMentions(real(name)), 1, name);
  }
  assert.deepEqual([routePins(real('ci.yml')), routeMentions(real('ci.yml'))], [[], 0]);
  const files = Object.fromEntries(['publish.yml', 'release-check.yml', 'ci.yml'].map((name) => [`.github/workflows/${name}`, Buffer.from(real(name))]));
  const { git } = recordedGit({ commit: COMMIT, files });
  assert.deepEqual(workflowPins(git, COMMIT, '67dc3738bfba1e8cdf960b0301450db6ff410692'), { agree: true });
  assert.deepEqual(workflowPins(git, COMMIT, 'd'.repeat(40)), { agree: false, file: 'publish.yml', pin: '67dc3738bfba1e8cdf960b0301450db6ff410692' });
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
