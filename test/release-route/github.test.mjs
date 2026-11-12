// The one GitHub question. The "behind" answer is the real one for a ci commit two behind main
// (saved 2026-11-12, trimmed to the fields read; no author data kept).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { toolReviewed } from '../../src/release-route/github.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { fakeFetch, json } from './fake-fetch.mjs';

const SHA = '1df988109047e3143c71bf459f3e10c968376e13';
const URL_C = `https://api.github.com/repos/footprintjs/ci/compare/main...${SHA}?per_page=1`;
const behind = JSON.parse(readFileSync(new URL('fixtures/github/compare-behind.json', import.meta.url), 'utf8'));
const ask = (answer, extra = {}) => toolReviewed({ fetcher: fakeFetch({ [URL_C]: answer }).fetcher, sha: SHA, ...extra });
const refusedWith = async (promise) => {
  try { await promise; } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'accepted';
};

test('behind or identical with the commit as merge base: reviewed', async () => {
  assert.equal(await ask(json(behind)), true);
  assert.equal(await ask(json({ ...behind, status: 'identical' })), true);
});

test('ahead, diverged, a different merge base, or a commit GitHub does not know: not reviewed', async () => {
  assert.equal(await ask(json({ ...behind, status: 'ahead' })), false);
  assert.equal(await ask(json({ ...behind, status: 'diverged' })), false);
  assert.equal(await ask(json({ ...behind, merge_base_commit: { sha: 'a'.repeat(40) } })), false);
  assert.equal(await ask(json({ message: 'Not Found' }, 404)), false);
});

test('anything else is a refusal, never a pass', async () => {
  assert.equal(await refusedWith(ask(json({ ...behind, status: 'weird' }))), 'response-shape GitHub compare status');
  assert.equal(await refusedWith(ask(json({ status: 'behind' }))), 'response-shape GitHub compare');
  assert.equal(await refusedWith(ask(json({}, 403))), 'response-status GitHub HTTP 403');
  assert.equal(await refusedWith(toolReviewed({ fetcher: fakeFetch({}).fetcher, sha: 'HEAD' })), 'input-invalid tool commit');
});

test('the token goes in one header to the API host only; a bad API URL is refused before any request', async () => {
  const { fetcher, calls } = fakeFetch({ [URL_C]: json(behind), [URL_C.replace('api.github.com', 'ghe.example.invalid/api/v3')]: json(behind) });
  await toolReviewed({ fetcher, sha: SHA, token: 'ghs_secret' });
  assert.equal(calls[0].headers.authorization, 'Bearer ghs_secret');
  await toolReviewed({ fetcher, sha: SHA, apiUrl: 'https://ghe.example.invalid/api/v3/' });
  assert.equal(calls[1].url, `https://ghe.example.invalid/api/v3/repos/footprintjs/ci/compare/main...${SHA}?per_page=1`);
  assert.ok(!('authorization' in calls[1].headers));
  for (const apiUrl of ['http://api.github.com', 'https://x:y@api.github.com', 'https://api.github.com/?a=1', 'nope'])
    assert.equal(await refusedWith(toolReviewed({ fetcher, sha: SHA, apiUrl })), 'input-invalid GITHUB_API_URL');
  assert.equal(await refusedWith(toolReviewed({ fetcher, sha: SHA, token: 'bad token' })), 'input-invalid GITHUB_TOKEN');
  assert.equal(calls.length, 2);
});
