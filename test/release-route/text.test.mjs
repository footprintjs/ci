import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clean, cleanLines, neutralise, printable } from '../../src/release-route/text.mjs';

test('printable flattens, strips control, format and bidi characters, and breaks workflow commands', () => {
  assert.equal(printable('ok\u{202E}::set-output name=x::y'), 'ok: :set-output name=x: :y');
  assert.equal(printable('a\nb\rc\u{2028}d\u{2029}e\tf\u0000g'), 'a b c d e f g');
  assert.equal(printable('##[error]x'), '# #[error]x');
  assert.equal(printable(':::'), ': : :');
  assert.equal(printable('\u{200B}zero\u{2066}width\u{2069}'), 'zerowidth');
  assert.equal(printable(42), '');
  assert.equal(printable(undefined), '');
});

test('printable cuts to its bound by code point, and the cut cannot rebuild a command', () => {
  assert.equal(printable('x'.repeat(130)), `${'x'.repeat(120)}...`);
  assert.equal(printable('\u{1F600}'.repeat(5), 3), '\u{1F600}\u{1F600}\u{1F600}...');
  assert.equal(neutralise(clean(`${'a'.repeat(9)}::`, 10)), `${'a'.repeat(9)}:...`);
  assert.doesNotMatch(printable(`${'a'.repeat(119)}::x`), /::/);
});

test('cleanLines keeps lines, indentation and :: for a file, and bounds both ways', () => {
  assert.deepEqual(cleanLines('- a::b\n\n  - nested\u{202E}\r\n'), ['- a::b', '', '  - nested', '']);
  const long = cleanLines(Array(5).fill('x').join('\n'), { maxLines: 2 });
  assert.equal(long.length, 4);
  assert.match(long[3], /longer than the route copies/);
  assert.equal(cleanLines('y'.repeat(50), { maxLine: 10 })[0], `${'y'.repeat(10)}...`);
});
