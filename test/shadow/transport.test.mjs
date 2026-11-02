import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyTransport } from '../../src/github-readonly.mjs';
const repo = 'https://api.github.com/repos/footprintjs/foottrace';
const response = (value, init = {}) => new Response(typeof value === 'string' ? value : JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init });
test('fixed anonymous GET transport permits real source/registry routes, buffers and hashes observations', async () => {
  const calls = [];
  const transport = createReadOnlyTransport({ fetcher: async (url, options) => { calls.push({ url, options }); return response({ name: 'foottrace' }); } });
  assert.deepEqual(await transport.api('GET', '/repos/footprintjs/foottrace'), { data: { name: 'foottrace' } });
  await transport.fetcher('https://registry.npmjs.org/foottrace/1.10.0');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'manual');
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(transport.observations()[0].sha256.length, 64);
  assert(!JSON.stringify(transport.observations()).includes('/repos/'));
});
test('all mutations, credential headers, alternate hosts, arbitrary routes and URL credentials refuse before fetch', async () => {
  let calls = 0;
  const t = createReadOnlyTransport({ fetcher: async () => { calls++; return response({}); } });
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) await assert.rejects(t.api(method, '/repos/footprintjs/foottrace'), { code: 'readonly-method' });
  for (const input of ['http://api.github.com/repos/footprintjs/foottrace', repo + '/hooks', repo + '?token=secret',
    'https://evil.invalid/foottrace/latest', 'https://registry.npmjs.org/other/latest',
    'https://user:secret@api.github.com/repos/footprintjs/foottrace', repo + '/../../user', repo + '#secret']) {
    await assert.rejects(t.fetcher(input), { code: 'readonly-route' });
  }
  await assert.rejects(t.fetcher(repo, { headers: { authorization: 'Bearer secret' } }), { code: 'readonly-headers' });
  await assert.rejects(t.fetcher(repo, { body: 'secret' }), { code: 'readonly-method' });
  assert.equal(calls, 0);
});
test('redirects refuse arbitrary hosts and allow only bounded release asset public byte retrieval', async () => {
  const calls = [];
  const t = createReadOnlyTransport({ fetcher: async (url, options) => {
    calls.push({url, options});
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/abcdef-123?sig=opaque' } }) : response('bytes');
  } });
  assert.equal((await t.api('GET', '/repos/footprintjs/foottrace/releases/assets/1', { accept: 'application/octet-stream' })).data.toString(), 'bytes');
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert(!JSON.stringify(t.observations()).includes('opaque'));
  const bad = createReadOnlyTransport({ fetcher: async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } }) });
  await assert.rejects(bad.fetcher(repo), { code: 'readonly-redirect' });
  const badAsset = createReadOnlyTransport({ fetcher: async () => new Response(null, { status: 302, headers: { location: 'https://evil.invalid/' } }) });
  await assert.rejects(badAsset.api('GET', '/repos/footprintjs/foottrace/releases/assets/1'), { code: 'readonly-route' });
});
test('request and streaming body limits hold instead of accepting incomplete or oversized reads', async () => {
  const t = createReadOnlyTransport({ maxRequests: 1, fetcher: async () => response({}) });
  await t.fetcher(repo);
  await assert.rejects(t.fetcher(repo), { code: 'readonly-request-limit' });
  const huge = createReadOnlyTransport({ maxResponseBytes: 3, fetcher: async () => response('1234') });
  await assert.rejects(huge.fetcher(repo), { code: 'readonly-response-limit' });
  const unavailable = createReadOnlyTransport({ fetcher: async () => response('secret endpoint response', { status: 503 }) });
  await assert.rejects(unavailable.api('GET', '/repos/footprintjs/foottrace'), { code: 'readonly-http', status: 503 });
});
test('existing read token is sent only to GitHub API and never npm or public asset redirects', async () => {
  const calls = [];
  const t = createReadOnlyTransport({ githubToken: 'ghp_fixtureReadToken', fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/releases/assets/')) return new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/abcdef-123?sig=opaque' } });
    return response('bytes');
  } });
  await t.api('GET', '/repos/footprintjs/foottrace/releases/assets/1', { accept: 'application/octet-stream' });
  await t.fetcher('https://registry.npmjs.org/foottrace/1.10.0');
  assert.equal(calls[0].options.headers.authorization, 'Bearer ghp_fixtureReadToken');
  assert.equal(calls[1].options.headers.authorization, undefined);
  assert.equal(calls[2].options.headers.authorization, undefined);
  assert(!JSON.stringify(t.observations()).includes('fixtureReadToken'));
});
test('npm metadata and tarball use registry media types, never GitHub API media types', async () => {
  const t=createReadOnlyTransport({fetcher:async(url,options)=>{
    const expected=url.endsWith('.tgz')?'application/octet-stream':'application/json';
    if(options.headers.accept!==expected)return new Response(null,{status:406});
    return response({name:'foottrace'});
  }});
  assert.equal((await t.fetcher('https://registry.npmjs.org/foottrace/1.10.0')).status,200);
  assert.equal((await t.fetcher('https://registry.npmjs.org/foottrace/latest')).status,200);
  assert.equal((await t.fetcher('https://registry.npmjs.org/foottrace/-/foottrace-1.10.0.tgz')).status,200);
});
