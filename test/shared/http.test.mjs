// The one bounded GET, in its own vocabulary (HttpFailure kinds). The hold check and the release
// route each word these failures; their own tests pin the words.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundedGet, HttpFailure } from '../../src/shared/http.mjs';

const URL_A = 'https://api.github.com/x';
const kind = async (promise) => {
  try { await promise; } catch (error) { return error instanceof HttpFailure ? `${error.kind}${error.status ? ` ${error.status}` : ''}` : `raw ${error?.message}`; }
  return 'answered';
};
const get = (fetcher, extra = {}) => boundedGet({ fetcher, url: URL_A, maxBytes: 100, timeoutMs: 1000, ...extra });

test('a GET with redirect "manual", the given headers, and status + bytes back', async () => {
  const calls = [];
  const answer = await get(async (url, init) => { calls.push({ url, ...init }); return new Response('{"a":1}', { status: 404 }); }, { headers: { accept: 'x' } });
  assert.deepEqual([answer.status, answer.bytes.toString()], [404, '{"a":1}']);
  assert.deepEqual([calls[0].method, calls[0].redirect, calls[0].headers.accept], ['GET', 'manual', 'x']);
});

test('every failure has a kind', async () => {
  assert.equal(await kind(get(async () => new Response(null, { status: 301 }))), 'redirect 301');
  assert.equal(await kind(get(async () => { throw new TypeError('fetch failed'); })), 'network');
  assert.equal(await kind(get(async () => ({}))), 'no-response');
  assert.equal(await kind(get(async () => ({ status: 200, text: async () => { throw new Error('x'); } }))), 'body');
  assert.equal(await kind(get(async () => new Response('x'.repeat(101)))), 'too-large');
  for (const url of ['http://api.github.com/x', 'https://u:p@api.github.com/x', 'nope']) assert.equal(await kind(get(async () => new Response(''), { url })), 'url');
  assert.equal(await kind(get('not a function')), 'request');
  assert.equal(await kind(get(async () => new Response(''), { timeoutMs: 0 })), 'request');
});

test('a Content-Length over the bound is refused before the body is read (M7 of the second read)', async () => {
  let pulled = false;
  // Hand-made answers: undici's Response does not keep a Content-Length set by hand.
  const answer = (length, text) => async () => ({ status: 200, headers: new Headers({ 'content-length': length }),
    body: { getReader() { pulled = true; return new Response(text).body.getReader(); } } });
  assert.equal(await kind(get(answer('999', 'x'))), 'too-large 200');
  assert.equal(pulled, false);
  assert.equal((await get(answer('5', '12345'))).bytes.toString(), '12345');
  assert.equal(pulled, true);
});

test('the timer bounds a fetch that ignores its signal (N8), a stalled body and a slow trickle', async () => {
  const started = Date.now();
  assert.equal(await kind(get(() => new Promise(() => {}), { timeoutMs: 50 })), 'timeout');
  assert.ok(Date.now() - started < 1000);
  assert.equal(await kind(get(async () => new Response(new ReadableStream({ start() {} })), { timeoutMs: 50 })), 'timeout');
  const trickle = async () => new Response(new ReadableStream({ async pull(c) { await new Promise((r) => setTimeout(r, 20)); c.enqueue(new Uint8Array(1)); } }));
  assert.equal(await kind(get(trickle, { timeoutMs: 100, maxBytes: 1e6 })), 'timeout');
});

test('a hand-made answer with text() is bounded too', async () => {
  assert.equal((await get(async () => ({ status: 200, text: async () => '[]' }))).bytes.toString(), '[]');
  assert.equal(await kind(get(async () => ({ status: 200, text: async () => 'y'.repeat(101) }))), 'too-large');
});
