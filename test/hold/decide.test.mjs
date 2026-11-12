import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clean, decideHold } from '../../src/hold/decide.mjs';

const repo = 'footprintjs/example';
const hold = (number, title = `hold ${number}`, extra = {}) => ({ number, title, ...extra });
const decide = (input) => decideHold({ repo, ...input });
const text = (result) => result.lines.join('\n');

test('no hold: both modes pass', () => {
  assert.equal(decide({ mode: 'publish', holds: [] }).ok, true);
  const pr = decide({ mode: 'pull-request', holds: [], versions: { base: '1.0.0', head: '1.0.1' } });
  assert.equal(pr.ok, true);
  assert.match(text(pr), /no open issue or pull request/);
});
test('publish mode: one hold fails and names number, title and link', () => {
  const result = decide({ mode: 'publish', holds: [hold(12, 'Hold 10.8 until review')] });
  assert.equal(result.ok, false);
  assert.equal(result.checked, true);
  assert.match(text(result), /#12 "Hold 10.8 until review" https:\/\/github\.com\/footprintjs\/example\/issues\/12/);
  assert.match(text(result), /remove the label or close the item/);
});
test('pull-request mode: a hold with a version change fails and shows both versions', () => {
  const result = decide({ mode: 'pull-request', holds: [hold(7)], versions: { base: '1.2.3', head: '1.3.0' } });
  assert.equal(result.ok, false);
  assert.match(text(result), /1\.2\.3 -> 1\.3\.0/);
});
test('pull-request mode: a hold with the version left alone passes, and still lists the hold', () => {
  const result = decide({ mode: 'pull-request', holds: [hold(7)], versions: { base: '1.2.3', head: '1.2.3' } });
  assert.equal(result.ok, true);
  assert.match(text(result), /#7 /);
  assert.match(text(result), /still block every release/);
});
test('several holds are all named, in number order, each once', () => {
  const result = decide({ mode: 'publish', holds: [hold(30), hold(4), hold(18), hold(4)] });
  const numbers = [...text(result).matchAll(/^ {2}- #(\d+) /gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [4, 18, 30]);
  assert.match(text(result), /\(3\)/);
});
test('a long list is cut with a count, not printed whole', () => {
  const holds = Array.from({ length: 120 }, (_, i) => hold(i + 1));
  const result = decide({ mode: 'publish', holds });
  assert.match(text(result), /and 70 more/);
  assert.equal(result.lines.length < 60, true);
});
test('a pull request that itself carries the label is a hold like any other, and may still change nothing', () => {
  const holds = [hold(9, 'Release 2.0 heading', { pullRequest: true })];
  const release = decide({ mode: 'pull-request', holds, versions: { base: '1.0.0', head: '2.0.0' } });
  assert.equal(release.ok, false);
  assert.match(text(release), /#9 \(pull request\) /);
  assert.equal(decide({ mode: 'pull-request', holds, versions: { base: '1.0.0', head: '1.0.0' } }).ok, true);
  assert.equal(decide({ mode: 'publish', holds }).ok, false);
});
test('a title with newlines, control characters and 500 characters prints as one bounded line', () => {
  const evil = `::error::pwned\n::set-output name=x::y\r\u0007‮ ${'a'.repeat(500)}`;
  const result = decide({ mode: 'publish', holds: [hold(5, evil)] });
  for (const line of result.lines) {
    assert.doesNotMatch(line, /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
    assert.equal(line.startsWith('::'), false);
    assert.equal(line.length < 400, true);
  }
  const row = result.lines.find((line) => line.includes('#5'));
  assert.match(row, /^ {2}- #5 ": :error: :pwned : :set-output name=x: :y a+\.\.\." /);
});
test('clean breaks up "##[" and "::" wherever they appear, so no workflow command survives mid-line', () => {
  assert.equal(clean('x ##[add-mask]FAILED'), 'x # #[add-mask]FAILED');
  assert.equal(clean('a ::error:: b'), 'a : :error: : b');
  for (const hostile of ['x ##[add-mask]FAILED', 'a ::error:: b', '###[error]x ::::warning::y :::', '##[##[a]]', 'a\n::set-output name=x::y']) {
    const result = clean(hostile);
    assert.doesNotMatch(result, /##\[|::/, hostile);
    // The printed lines for a title and a version carry the same guarantee.
    const printed = decide({ mode: 'pull-request', holds: [hold(2, hostile)], versions: { base: hostile, head: `${hostile}!` } });
    for (const line of printed.lines) assert.doesNotMatch(line, /##\[|::/, hostile);
  }
  assert.equal(clean('plain title: with one colon, 2 # and #[x]'), 'plain title: with one colon, 2 # and #[x]');
});
test('a hostile version string is cleaned and bounded too', () => {
  const result = decide({ mode: 'pull-request', holds: [hold(1)], versions: { base: '1.0.0', head: `9\n::error::x${'z'.repeat(300)}` } });
  for (const line of result.lines) assert.equal(line.startsWith('::'), false);
  assert.equal(result.lines.every((line) => line.length < 400), true);
});
test('clean: non-strings become empty, whitespace collapses, cuts count characters not bytes', () => {
  assert.equal(clean(undefined), '');
  assert.equal(clean('  a \t\n b  '), 'a b');
  assert.equal(clean('\u{1F600}'.repeat(100), 3), '\u{1F600}\u{1F600}\u{1F600}...');
});
test('fail closed: unknown mode, bad repository, malformed list all say they could not check', () => {
  for (const input of [
    { mode: 'nope', holds: [] }, { mode: undefined, holds: [] }, { mode: 'publish', repo: 'no-slash', holds: [] },
    { mode: 'publish', repo: '../x', holds: [] }, { mode: 'publish', repo: undefined, holds: [] },
    { mode: 'publish', holds: 'none' }, { mode: 'publish', holds: undefined }, { mode: 'publish', holds: [{ number: 1 }] },
    { mode: 'publish', holds: [{ number: -1, title: 'x' }] }, { mode: 'publish', holds: [null] },
  ]) {
    const result = decideHold({ repo, ...input });
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(result.checked, false);
    assert.match(text(result), /could not check/);
  }
});
test('fail closed: pull-request mode needs two readable versions, with or without holds', () => {
  for (const versions of [undefined, {}, { base: '1.0.0' }, { head: '1.0.0' }, { base: '', head: '1' }, { base: 1, head: '1' }, { base: null, head: null }]) {
    for (const holds of [[], [hold(1)]]) {
      const result = decide({ mode: 'pull-request', holds, versions });
      assert.equal(result.ok, false);
      assert.match(text(result), /could not check/);
    }
  }
});
