// The one table of refusals: its shape, and how a thrown value becomes one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import archiveRefusal from '../../src/release-route/archive/refusal.cjs';
import { REFUSALS, Refusal, asRefusal, refuse } from '../../src/release-route/refusals.mjs';

test('every code is kebab-case with a sentence a person can act on', () => {
  for (const [code, sentence] of Object.entries(REFUSALS)) {
    assert.match(code, /^[a-z]+(-[a-z]+)*$/, code);
    assert.match(sentence, /^[A-Z.a-z"].{10,150}\.$/, code);
  }
});

test('an unknown code is itself a refusal, keeping the bad code visible', () => {
  const error = new Refusal('no-such-code', 'x');
  assert.equal(error.code, 'unknown-refusal');
  assert.equal(error.detail, 'no-such-code');
  assert.throws(() => refuse('also-unknown'), (e) => e instanceof Refusal && e.code === 'unknown-refusal');
  assert.equal(new Refusal('__proto__').code, 'unknown-refusal');
});

test('any thrown value becomes a refusal: named archive codes keep their field, the rest is unexpected', () => {
  let archive;
  try { archiveRefusal.fail('archive-path', { text: 'package/x' }); } catch (error) { archive = error; }
  assert.deepEqual([asRefusal(archive).code, asRefusal(archive).detail], ['archive-path', 'package/x']);
  for (const thrown of [new Error('boom'), 'text', null, undefined, 42, { code: 'archive-path' }])
    assert.equal(asRefusal(thrown).code, 'unexpected-failure');
  const timeout = new Error('t');
  timeout.name = 'TimeoutError';
  assert.equal(asRefusal(timeout).detail, 'timeout');
  const kept = new Refusal('git-failed', 'tags');
  assert.deepEqual([asRefusal(kept).code, asRefusal(kept).detail, asRefusal(kept) instanceof Refusal], ['git-failed', 'tags', true]);
  assert.equal(kept.sentence, REFUSALS['git-failed']);
});

// A value is a refusal only when its prototype is exactly Refusal.prototype and `code` and `detail`
// are own DATA properties holding strings, with `code` in the table. Anything else is
// unexpected-failure with an empty detail, and no getter of the thrown value runs (a getter can
// hold a secret, or a message the route never cleaned).
test('a fake or altered Refusal is unexpected-failure with an empty detail, and none of its getters runs', () => {
  const SECRET = 'ghs_PlantedSecret0123456789abcdef';
  const ran = [];
  const getter = (name) => ({ get() { ran.push(name); return SECRET; }, configurable: true });
  const detailGetter = new Refusal('git-failed', '');
  Object.defineProperty(detailGetter, 'detail', getter('detail'));
  const codeGetter = new Refusal('git-failed', '');
  Object.defineProperty(codeGetter, 'code', getter('code'));
  class Sub extends Refusal {}
  const unknownCode = new Refusal('git-failed', 'x');
  unknownCode.code = 'no-such-code';
  const numberDetail = new Refusal('git-failed', 'x');
  numberDetail.detail = 42;
  for (const [label, thrown] of [
    ['a fake whose code is a getter', Object.create(Refusal.prototype, { code: getter('fake code'), detail: { value: 'd' } })],
    ['a fake whose detail is a getter', Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: getter('fake detail') })],
    ['a fake with inherited fields', Object.create(Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: { value: SECRET } }))],
    ['a real Refusal whose detail became a getter', detailGetter],
    ['a real Refusal whose code became a getter', codeGetter],
    ['a subclass', new Sub('git-failed', SECRET)],
    ['a code not in the table', unknownCode],
    ['a detail that is not a string', numberDetail],
    ['a non-refusal whose name is a getter', Object.defineProperty(new Error('x'), 'name', getter('name'))],
  ]) {
    const refusal = asRefusal(thrown);
    assert.deepEqual([refusal.code, refusal.detail], ['unexpected-failure', ''], label);
  }
  assert.deepEqual(ran, [], 'a getter of the thrown value ran');
  const plain = Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: { value: 'tags' } });
  assert.deepEqual([asRefusal(plain).code, asRefusal(plain).detail], ['git-failed', 'tags'], 'own data strings with a known code are a refusal');
});
