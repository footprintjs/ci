// A thrown value is read by asRefusal, which must never throw: a getter or a Proxy trap that
// throws while it is read ends as unexpected-failure, printed, exit 1, on both paths.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asRefusal, Refusal } from '../../../src/release-route/refusals.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { runHandlers } from '../../../src/release-route/step-common.mjs';

const HOSTILE = {
  'a name getter that throws': { get name() { throw new Error('n'); } },
  'a Proxy whose every trap throws': new Proxy({}, { get() { throw new Error('g'); }, getPrototypeOf() { throw new Error('p'); }, has() { throw new Error('h'); } }),
  'a revoked Proxy': (() => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; })(),
  'a fake Refusal whose code getter throws': Object.create(Refusal.prototype, { code: { get() { throw new Error('c'); } } }),
};

for (const [label, value] of Object.entries(HOSTILE))
  test(`asRefusal never throws, and a step that throws it prints unexpected-failure and returns 1: ${label}`, async () => {
    assert.equal(asRefusal(value).code, 'unexpected-failure');
    const printed = [];
    const report = createReport({ env: {}, print: (line) => printed.push(line), append: () => {} });
    assert.equal(await runHandlers({ boom: () => { throw value; } }, 'boom', { report }), 1);
    assert.match(printed[0], /^Refused: unexpected-failure\./);
  });

test('a real Refusal keeps its code and detail; a timeout is still named', () => {
  const kept = asRefusal(new Refusal('input-invalid', 'GITHUB_SHA'));
  assert.deepEqual([kept.code, kept.detail], ['input-invalid', 'GITHUB_SHA']);
  assert.equal(asRefusal(new DOMException('t', 'TimeoutError')).detail, 'timeout');
});
