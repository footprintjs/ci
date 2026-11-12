import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clean, cleanLines, flatten, neutralise } from '../../src/shared/text.mjs';

test('clean flattens, strips control, format and bidi characters, and breaks workflow commands', () => {
  assert.equal(clean('ok\u{202E}::set-output name=x::y'), 'ok: :set-output name=x: :y');
  assert.equal(clean('a\nb\rc\u{2028}d\u{2029}e\tf\u0000g'), 'a b c d e f g');
  assert.equal(clean('##[error]x'), '# #[error]x');
  assert.equal(clean(':::'), ': : :');
  assert.equal(clean('\u{200B}zero\u{2066}width\u{2069}'), 'zerowidth');
  assert.equal(clean(42), '');
  assert.equal(clean(undefined), '');
});

test('clean cuts to its bound by code point, after breaking commands, so the cut cannot rebuild one', () => {
  assert.equal(clean('x'.repeat(130), 120), `${'x'.repeat(120)}...`);
  assert.equal(clean('x'.repeat(90)), `${'x'.repeat(80)}...`);
  assert.equal(clean('\u{1F600}'.repeat(5), 3), '\u{1F600}\u{1F600}\u{1F600}...');
  for (let n = 1; n < 12; n++) assert.doesNotMatch(clean('a::b::c##[d', n), /::|##\[/);
  assert.equal(neutralise('a::b'), 'a: :b');
});

test('flatten keeps :: for a file, cleanLines keeps lines and indentation, and both are bounded', () => {
  assert.equal(flatten('a::b\u{202E}', 10), 'a::b');
  assert.deepEqual(cleanLines('- a::b\n\n  - nested\u{202E}\r\n'), ['- a::b', '', '  - nested', '']);
  const long = cleanLines(Array(5).fill('x').join('\n'), { maxLines: 2 });
  assert.equal(long.length, 4);
  assert.match(long[3], /longer than the route copies/);
  assert.equal(cleanLines('y'.repeat(50), { maxLine: 10 })[0], `${'y'.repeat(10)}...`);
});
