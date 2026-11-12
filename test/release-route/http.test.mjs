import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerJson, boundedGet } from '../../src/release-route/http.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { fakeFetch, json } from './fake-fetch.mjs';

const URL_A = 'https://registry.npmjs.org/a';
const refusedWith = async (promise) => {
  try { await promise; } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'accepted';
};

test('a GET with redirect "manual" and the given headers; status and bytes come back', async () => {
  const { fetcher, calls } = fakeFetch({ [URL_A]: json({ ok: true }, 404) });
  const answer = await boundedGet({ fetcher, url: URL_A, maxBytes: 100, headers: { accept: 'x' } });
  assert.equal(answer.status, 404);
  assert.equal(answer.bytes.toString(), '{"ok":true}');
  assert.deepEqual(calls, [{ url: URL_A, method: 'GET', redirect: 'manual', headers: { accept: 'x' } }]);
});

test('a redirect is refused, never followed', async () => {
  const { fetcher, calls } = fakeFetch({ [URL_A]: () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } }) });
  assert.equal(await refusedWith(boundedGet({ fetcher, url: URL_A, maxBytes: 100 })), 'response-redirect registry.npmjs.org HTTP 302');
  assert.equal(calls.length, 1);
});

test('an answer over its bound is refused, by Content-Length or while reading', async () => {
  const big = () => new Response('x'.repeat(101), { status: 200 });
  assert.equal(await refusedWith(boundedGet({ fetcher: fakeFetch({ [URL_A]: big }).fetcher, url: URL_A, maxBytes: 100 })), 'response-too-large registry.npmjs.org');
  const streamed = () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(60)); } }), { status: 200 });
  assert.equal(await refusedWith(boundedGet({ fetcher: fakeFetch({ [URL_A]: streamed }).fetcher, url: URL_A, maxBytes: 100 })), 'response-too-large registry.npmjs.org');
});

test('a network failure and a timeout are request-failed', async () => {
  assert.equal(await refusedWith(boundedGet({ fetcher: fakeFetch({}).fetcher, url: URL_A, maxBytes: 100 })), 'request-failed registry.npmjs.org network error');
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  assert.equal(await refusedWith(boundedGet({ fetcher: hang, url: URL_A, maxBytes: 100, timeoutMs: 20 })), 'request-failed registry.npmjs.org timeout');
  const slowBody = () => new Response(new ReadableStream({ start() {} }), { status: 200 });
  assert.equal(await refusedWith(boundedGet({ fetcher: fakeFetch({ [URL_A]: slowBody }).fetcher, url: URL_A, maxBytes: 100, timeoutMs: 20 })),
    'request-failed registry.npmjs.org timeout');
  assert.equal(await refusedWith(boundedGet({ fetcher: async () => ({}), url: URL_A, maxBytes: 100 })), 'request-failed registry.npmjs.org no usable response');
});

test('only https URLs without credentials', async () => {
  const { fetcher, calls } = fakeFetch({});
  for (const url of ['http://registry.npmjs.org/a', 'https://user:pw@registry.npmjs.org/a', 'not a url', 'file:///etc/passwd'])
    assert.equal(await refusedWith(boundedGet({ fetcher, url, maxBytes: 100 })), 'input-invalid url');
  assert.equal(calls.length, 0);
});

test('JSON answers are strict: a duplicate key is response-not-json', () => {
  assert.throws(() => answerJson(Buffer.from('{"a":1,"a":2}'), { maxBytes: 100 }, 'h'), (e) => asRefusal(e).code === 'response-not-json');
  assert.throws(() => answerJson(Buffer.from('{"a":1}'), { maxBytes: 3 }, 'h'), (e) => asRefusal(e).code === 'response-not-json');
  assert.deepEqual(answerJson(Buffer.from('{"a":1}'), { maxBytes: 100 }, 'h'), { a: 1 });
});
