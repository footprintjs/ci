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
  assert.equal(asRefusal(kept), kept);
  assert.equal(kept.sentence, REFUSALS['git-failed']);
});
