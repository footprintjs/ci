// The release job's decision: create, skip, or stop, for the tag and for the GitHub release.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { decideRelease, decideTag, tagPlan } from '../../src/release-route/tag.mjs';
import { fakeFetch, json } from './fake-fetch.mjs';

const COMMIT = 'c94c2a6fed62378c428df22d316d36f576511d6a';
const OTHER = 'a'.repeat(40);
const RELEASE_URL = 'https://api.github.com/repos/footprintjs/storydeck/releases/tags/v0.13.1';
const code = async (fn) => {
  try { return await fn(); } catch (error) { const r = asRefusal(error); return `${r.code}${r.detail ? ` ${r.detail}` : ''}`; }
};
const lsRemote = (text) => (args) => {
  if (args[0] !== 'ls-remote' || args[1] !== 'origin' || args[2] !== 'refs/tags/v0.13.1' || args[3] !== 'refs/tags/v0.13.1^{}') throw new Error('unexpected git');
  return Buffer.from(text);
};

test('the tag: absent -> create, at the planned commit -> skip, at another commit -> tag-elsewhere', async () => {
  assert.equal(decideTag({ tagAt: null, commit: COMMIT }), 'create');
  assert.equal(decideTag({ tagAt: COMMIT, commit: COMMIT }), 'skip');
  assert.equal(await code(() => decideTag({ tagAt: OTHER, commit: COMMIT })), `tag-elsewhere v-tag at ${OTHER}`);
});

test('the GitHub release: absent -> create, present for this tag -> skip, a draft or another tag -> release-unexpected', async () => {
  assert.equal(decideRelease({ release: null, version: '0.13.1' }), 'create');
  assert.equal(decideRelease({ release: { tagName: 'v0.13.1', draft: false }, version: '0.13.1' }), 'skip');
  assert.equal(await code(() => decideRelease({ release: { tagName: 'v0.13.1', draft: true }, version: '0.13.1' })), 'release-unexpected draft');
  assert.equal(await code(() => decideRelease({ release: { tagName: 'v0.13.0', draft: false }, version: '0.13.1' })), 'release-unexpected another tag');
});

test('through the doors: the tag is asked of origin with its peeled line; the release of the fixed API host with the token', async () => {
  const { fetcher, calls } = fakeFetch({ [RELEASE_URL]: json({ tag_name: 'v0.13.1', draft: false, name: 'x' }) });
  const result = await tagPlan({ git: lsRemote(`${COMMIT}\trefs/tags/v0.13.1\n`), fetcher, repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT, token: 'ghs_x' });
  assert.deepEqual(result, { tag: 'skip', release: 'skip' });
  assert.equal(calls[0].headers.authorization, 'Bearer ghs_x');
  const fresh = await tagPlan({ git: lsRemote(''), fetcher: fakeFetch({ [RELEASE_URL]: json({ message: 'Not Found' }, 404) }).fetcher,
    repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT });
  assert.deepEqual(fresh, { tag: 'create', release: 'create' });
  const annotated = `${OTHER}\trefs/tags/v0.13.1\n${COMMIT}\trefs/tags/v0.13.1^{}\n`;
  assert.equal((await tagPlan({ git: lsRemote(annotated), fetcher, repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT })).tag, 'skip');
});

test('anything unreadable is a refusal, never create', async () => {
  const fetcher = fakeFetch({ [RELEASE_URL]: json({ tag_name: 'v0.13.1' }) }).fetcher;
  assert.equal(await code(() => tagPlan({ git: lsRemote(''), fetcher, repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT })), 'response-shape GitHub release');
  assert.equal(await code(() => tagPlan({ git: lsRemote('junk\n'), fetcher, repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT })), 'git-failed ls-remote tags');
  const down = fakeFetch({ [RELEASE_URL]: json({}, 502) }).fetcher;
  assert.equal(await code(() => tagPlan({ git: lsRemote(''), fetcher: down, repo: 'footprintjs/storydeck', version: '0.13.1', commit: COMMIT })), 'response-status GitHub HTTP 502');
  for (const repo of [undefined, 'storydeck', '../x', 'a/b/c'])
    assert.equal(await code(() => tagPlan({ git: lsRemote(''), fetcher, repo, version: '0.13.1', commit: COMMIT })), 'input-invalid GITHUB_REPOSITORY');
});
