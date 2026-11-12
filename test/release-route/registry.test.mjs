// npm's answers, saved once from registry.npmjs.org on 2026-11-12 (footprint-storydeck; the
// one-version document trimmed to name, version and dist), and every way they can be wrong.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { compareWithNpm, integrityOf, readDist, readVersions, tarballUrl, waitForDist } from '../../src/release-route/registry.mjs';
import { bytes, fakeFetch, json } from './fake-fetch.mjs';

const saved = (name) => readFileSync(new URL(`fixtures/npm/${name}`, import.meta.url), 'utf8');
const NAME = 'footprint-storydeck';
const DOC = `https://registry.npmjs.org/${NAME}`;
const V = `${DOC}/0.13.1`;
const versionDoc = JSON.parse(saved('footprint-storydeck-0.13.1.json'));
const refusedWith = async (promise) => {
  try { await promise; } catch (error) { const r = asRefusal(error); return r.detail ? `${r.code} ${r.detail}` : r.code; }
  return 'accepted';
};
const noSleep = async () => {};

test('the real package document: known, 14 versions, 0.13.1 among them; no token is ever sent', async () => {
  const { fetcher, calls } = fakeFetch({ [DOC]: json(saved('footprint-storydeck.abbrev.json')) });
  const answer = await readVersions({ fetcher, name: NAME });
  assert.equal(answer.known, true);
  assert.equal(answer.versions.length, 14);
  assert.ok(answer.versions.includes('0.13.1'));
  assert.equal(calls[0].headers.accept, 'application/vnd.npm.install-v1+json');
  assert.ok(!('authorization' in calls[0].headers));
});

test('404 is "unknown package"; any other status, shape or JSON fault is refused', async () => {
  assert.deepEqual(await readVersions({ fetcher: fakeFetch({ [DOC]: json({ error: 'Not found' }, 404) }).fetcher, name: NAME }), { known: false, versions: [] });
  const cases = [
    [json({}, 500), 'response-status npm HTTP 500'],
    [json({ name: 'other', versions: {} }), 'response-shape npm package document'],
    [json({ name: NAME, versions: [] }), 'response-shape npm package document'],
    [json({ name: NAME, versions: { '1.0.0': { version: '1.0.1' } } }), 'response-shape npm versions'],
    [json(`{"name":"${NAME}","name":"${NAME}","versions":{}}`), 'response-not-json registry.npmjs.org'],
  ];
  for (const [answer, expected] of cases)
    assert.equal(await refusedWith(readVersions({ fetcher: fakeFetch({ [DOC]: answer }).fetcher, name: NAME })), expected);
});

test('a scoped name is escaped in the document path; a bad name never leaves the machine', async () => {
  const { fetcher, calls } = fakeFetch({ 'https://registry.npmjs.org/@scope%2fpkg': json({}, 404) });
  await readVersions({ fetcher, name: '@scope/pkg' });
  assert.equal(calls.length, 1);
  for (const name of ['../x', 'A', 'a?b', 'a#b'])
    assert.equal(await refusedWith(readVersions({ fetcher, name })), 'input-invalid package');
  assert.equal(calls.length, 1);
  assert.equal(tarballUrl('@scope/pkg', '1.0.0'), 'https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0.tgz');
});

test('one version: the real 0.13.1 dist; the tarball address must be exactly the expected one', async () => {
  const dist = await readDist({ fetcher: fakeFetch({ [V]: json(versionDoc) }).fetcher, name: NAME, version: '0.13.1' });
  assert.equal(dist.integrity, 'sha512-ihxvVTOSbIyS5ep6Fgf49FZSIlgMHxOKNNgjsG4MqsiEPTdP8U9qL69NJnW3REM7EUe8d051B4ZxNLQ70nhOiA==');
  assert.equal(await readDist({ fetcher: fakeFetch({ [V]: json({}, 404) }).fetcher, name: NAME, version: '0.13.1' }), null);
  for (const tarball of ['https://evil.invalid/x.tgz', 'http://registry.npmjs.org/footprint-storydeck/-/footprint-storydeck-0.13.1.tgz',
    'https://registry.npmjs.org/footprint-storydeck/-/footprint-storydeck-0.13.0.tgz'])
    assert.equal(await refusedWith(readDist({ fetcher: fakeFetch({ [V]: json({ ...versionDoc, dist: { ...versionDoc.dist, tarball } }) }).fetcher, name: NAME, version: '0.13.1' })), 'tarball-url');
  for (const doc of [{ ...versionDoc, version: '0.13.0' }, { ...versionDoc, dist: { tarball: versionDoc.dist.tarball, integrity: 'sha1-abc' } }, { name: NAME, version: '0.13.1' }])
    assert.equal(await refusedWith(readDist({ fetcher: fakeFetch({ [V]: json(doc) }).fetcher, name: NAME, version: '0.13.1' })), 'response-shape npm version document');
});

test('the bounded wait: a late version is found; one that never shows is registry-late after the last look', async () => {
  let looks = 0;
  const late = async (url, init) => (++looks < 3 ? json({}, 404)() : json(versionDoc)());
  const sleeps = [];
  const dist = await waitForDist({ fetcher: late, name: NAME, version: '0.13.1', sleep: async (ms) => sleeps.push(ms), wait: { tries: 5, delayMs: 7 } });
  assert.equal(dist.tarball, versionDoc.dist.tarball);
  assert.deepEqual(sleeps, [7, 7]);
  const never = fakeFetch({ [V]: json({}, 404) });
  assert.equal(await refusedWith(waitForDist({ fetcher: never.fetcher, name: NAME, version: '0.13.1', sleep: noSleep, wait: { tries: 4, delayMs: 1 } })),
    'registry-late footprint-storydeck@0.13.1');
  assert.equal(never.calls.length, 4);
});

test('npm must serve the same bytes: integrity and the downloaded tarball are both compared', async () => {
  const local = Buffer.from('the built tarball');
  const doc = { ...versionDoc, dist: { ...versionDoc.dist, integrity: integrityOf(local) } };
  const routes = (served) => fakeFetch({ [V]: json(doc), [versionDoc.dist.tarball]: bytes(served) }).fetcher;
  const ok = await compareWithNpm({ fetcher: routes(local), name: NAME, version: '0.13.1', localBytes: local, sleep: noSleep });
  assert.equal(ok.integrity, integrityOf(local));
  assert.equal(await refusedWith(compareWithNpm({ fetcher: routes(Buffer.from('other bytes')), name: NAME, version: '0.13.1', localBytes: local, sleep: noSleep })),
    'registry-differs tarball bytes');
  assert.equal(await refusedWith(compareWithNpm({ fetcher: routes(local), name: NAME, version: '0.13.1', localBytes: Buffer.from('rebuilt differently'), sleep: noSleep })),
    'registry-differs integrity');
  const missing = fakeFetch({ [V]: json(doc), [versionDoc.dist.tarball]: bytes(local, 403) }).fetcher;
  assert.equal(await refusedWith(compareWithNpm({ fetcher: missing, name: NAME, version: '0.13.1', localBytes: local, sleep: noSleep })), 'response-status npm tarball HTTP 403');
});
