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

// A value is a refusal only when the Refusal constructor made it: the code and detail live in
// private fields only the constructor sets, and `#field in value` is the test. Anything else is
// unexpected-failure with an empty detail, and no getter, trap or property of the thrown value
// runs (a getter can hold a secret, or a message the route never cleaned).
test('a fake Refusal is unexpected-failure with an empty detail, and none of its getters runs', () => {
  const SECRET = 'ghs_PlantedSecret0123456789abcdef';
  const ran = [];
  const getter = (name) => ({ get() { ran.push(name); return SECRET; }, configurable: true });
  for (const [label, thrown] of [
    ['a fake whose code is a getter', Object.create(Refusal.prototype, { code: getter('fake code'), detail: { value: 'd' } })],
    ['a fake whose detail is a getter', Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: getter('fake detail') })],
    ['a fake with inherited fields', Object.create(Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: { value: SECRET } }))],
    ['a fake with own data strings and a known code', Object.create(Refusal.prototype, { code: { value: 'git-failed' }, detail: { value: SECRET } })],
    ['a look-alike object', { name: 'Refusal', code: 'git-failed', detail: SECRET }],
    ['a non-refusal whose name is a getter', Object.defineProperty(new Error('x'), 'name', getter('name'))],
  ]) {
    const refusal = asRefusal(thrown);
    assert.deepEqual([refusal.code, refusal.detail], ['unexpected-failure', ''], label);
  }
  assert.deepEqual(ran, [], 'a getter of the thrown value ran');
});

// The code and detail a refusal was MADE with are what asRefusal serves; the public properties are
// for callers and tests and asRefusal never reads them.
test('a real Refusal prints the code and detail it was made with, whatever its public fields became', () => {
  const ran = [];
  const getter = (name) => ({ get() { ran.push(name); return 'ghs_PlantedSecret0123456789abcdef'; }, configurable: true });
  const detailGetter = new Refusal('git-failed', 'tags');
  Object.defineProperty(detailGetter, 'detail', getter('detail'));
  const codeGetter = new Refusal('git-failed', 'tags');
  Object.defineProperty(codeGetter, 'code', getter('code'));
  const reassigned = new Refusal('git-failed', 'tags');
  reassigned.code = 'no-such-code';
  reassigned.detail = 42;
  class Sub extends Refusal {}
  for (const [label, thrown] of [['a detail getter', detailGetter], ['a code getter', codeGetter], ['reassigned fields', reassigned], ['a subclass', new Sub('git-failed', 'tags')]]) {
    const refusal = asRefusal(thrown);
    assert.deepEqual([refusal.code, refusal.detail], ['git-failed', 'tags'], label);
  }
  assert.deepEqual(ran, [], 'a getter of the refusal ran');
  const unknown = asRefusal(new Refusal('no-such-code', 'x'));
  assert.deepEqual([unknown.code, unknown.detail], ['unknown-refusal', 'no-such-code'], 'an unknown code stays visible');
});

// The reader's case: a Proxy that poses as a Refusal (a getPrototypeOf trap answering
// Refusal.prototype, a descriptor trap answering a planted secret). Recognising it must run no trap.
test('a Proxy posing as a Refusal is unexpected-failure with an empty detail, and no trap runs', () => {
  const calls = [];
  const trap = (name, answer) => (...args) => { calls.push(name); return answer(...args); };
  const posing = new Proxy({}, {
    getPrototypeOf: trap('getPrototypeOf', () => Refusal.prototype),
    getOwnPropertyDescriptor: trap('getOwnPropertyDescriptor', (_target, key) => ({ value: key === 'code' ? 'git-failed' : 'token ghs_PlantedSecret0123456789abcdef', configurable: true, enumerable: true, writable: true })),
    has: trap('has', () => true),
    get: trap('get', () => 'ghs_PlantedSecret0123456789abcdef'),
    ownKeys: trap('ownKeys', () => []),
  });
  const refusal = asRefusal(posing);
  assert.deepEqual([refusal.code, refusal.detail], ['unexpected-failure', '']);
  assert.deepEqual(calls, [], 'a trap of the thrown value ran');
  const named = new Proxy({}, { getOwnPropertyDescriptor: trap('getOwnPropertyDescriptor', () => ({ value: 'TimeoutError', configurable: true })) });
  assert.equal(asRefusal(named).detail, '', 'a Proxy is not asked for its name either');
  assert.deepEqual(calls, [], 'a trap of the thrown value ran');
});
