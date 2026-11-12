// The publish job's re-run question, decided as data and through the registry doors.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideReady, ready } from '../../src/release-route/ready.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';
import { integrityOf } from '../../src/release-route/registry.mjs';
import { bytes, fakeFetch, json } from './fake-fetch.mjs';

const NAME = 'footprint-storydeck';
const V = `https://registry.npmjs.org/${NAME}/0.13.2`;
const TARBALL = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.2.tgz`;
const local = Buffer.from('the built tarball');
const doc = (integrity) => ({ name: NAME, version: '0.13.2', dist: { integrity, tarball: TARBALL } });
const outcome = async (routes) => {
  try { return await ready({ fetcher: fakeFetch(routes).fetcher, name: NAME, version: '0.13.2', localBytes: local }); }
  catch (error) { const r = asRefusal(error); return `${r.code} ${r.detail}`; }
};

test('the decision: not on npm -> publish; on npm with equal integrity and bytes -> do not publish again; else refuse', () => {
  assert.equal(decideReady({ npmHasVersion: false }), 'yes');
  assert.equal(decideReady({ npmHasVersion: true, integrityEqual: true, bytesEqual: true }), 'no');
  for (const [facts, code] of [
    [{ npmHasVersion: true, integrityEqual: false, bytesEqual: false }, 'registry-differs'],
    [{ npmHasVersion: true, integrityEqual: true, bytesEqual: false }, 'registry-differs'],
    [{ npmHasVersion: null }, 'fact-unreadable'],
    [{}, 'fact-unreadable'],
  ]) assert.throws(() => decideReady(facts), (e) => asRefusal(e).code === code, JSON.stringify(facts));
});

test('through the doors: 404 -> yes; equal -> no; other integrity or other served bytes -> registry-differs', async () => {
  assert.equal(await outcome({ [V]: json({}, 404) }), 'yes');
  assert.equal(await outcome({ [V]: json(doc(integrityOf(local))), [TARBALL]: bytes(local) }), 'no');
  assert.equal(await outcome({ [V]: json(doc(integrityOf(Buffer.from('other')))) }), 'registry-differs integrity');
  assert.equal(await outcome({ [V]: json(doc(integrityOf(local))), [TARBALL]: bytes(Buffer.from('other')) }), 'registry-differs tarball bytes');
  assert.equal(await outcome({ [V]: json({}, 500) }), 'response-status npm HTTP 500');
});
