// The publish job's last question before `npm publish`, decided as data and through the doors.
// Since the "Re-run failed jobs" finding (B1): a re-run reuses the OLD plan's outputs, so when npm
// lacks the version, `ready` measures again, with the plan's own readers, that the planned commit
// is still the tip of main and the version still newer than every published one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideReady, ready } from '../../src/release-route/ready.mjs';
import { asRefusal, Refusal } from '../../src/release-route/refusals.mjs';
import { integrityOf } from '../../src/release-route/registry.mjs';
import { bytes, fakeFetch, json } from './fake-fetch.mjs';
import { recordedGit } from './recorded-git.mjs';

const NAME = 'footprint-storydeck';
const COMMIT = 'a3936e304d8670f7fcec40d227df1309a994d46c';
const LATER = 'b'.repeat(40);
const V = `https://registry.npmjs.org/${NAME}/0.13.2`;
const PACKUMENT = `https://registry.npmjs.org/${NAME}`;
const TARBALL = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.2.tgz`;
const local = Buffer.from('the built tarball');
const doc = (integrity) => ({ name: NAME, version: '0.13.2', dist: { integrity, tarball: TARBALL } });
const packument = (...versions) => json({ name: NAME, 'dist-tags': { latest: versions.at(-1) }, versions: Object.fromEntries(versions.map((v) => [v, { name: NAME, version: v }])) });
const outcome = async (routes, { mainTip = COMMIT } = {}) => {
  const { fetcher, calls } = fakeFetch(routes);
  const { git, calls: gitCalls } = recordedGit({ commit: COMMIT, files: {}, mainTip });
  try { return { answer: await ready({ fetcher, git, name: NAME, version: '0.13.2', commit: COMMIT, localBytes: local }), calls, gitCalls }; }
  catch (error) { const r = asRefusal(error); return { answer: `${r.code} ${r.detail}`, calls, gitCalls }; }
};
const code = (facts) => { try { return decideReady(facts); } catch (error) { return asRefusal(error).code; } };

test('the decision over every combination of its five facts, each true, false or unreadable', () => {
  const VALUES = [true, false, null];
  let seen = 0;
  for (const npmHasVersion of VALUES) for (const integrityEqual of VALUES) for (const bytesEqual of VALUES)
    for (const commitIsMainTip of VALUES) for (const versionNewer of VALUES) {
      seen++;
      const facts = { npmHasVersion, integrityEqual, bytesEqual, commitIsMainTip, versionNewer };
      const answer = code(facts);
      if (npmHasVersion === null) assert.equal(answer, 'fact-unreadable');
      else if (npmHasVersion === true) {
        // npm has it: today's rule, the tip and the order never asked (the way an unfinished release is finished).
        assert.equal(answer, integrityEqual === true && bytesEqual === true ? 'no' : 'registry-differs', JSON.stringify(facts));
      } else if (commitIsMainTip === false || versionNewer === false) assert.equal(answer, 'plan-stale', JSON.stringify(facts));
      else if (commitIsMainTip === null || versionNewer === null) assert.equal(answer, 'fact-unreadable', JSON.stringify(facts));
      else assert.equal(answer, 'yes', JSON.stringify(facts));
    }
  assert.equal(seen, 243);
  // The detail names the fact.
  assert.throws(() => decideReady({ npmHasVersion: false, commitIsMainTip: false, versionNewer: true }), (e) => e instanceof Refusal && e.detail === 'commitIsMainTip');
  assert.throws(() => decideReady({ npmHasVersion: false, commitIsMainTip: false, versionNewer: false }), (e) => e.detail === 'commitIsMainTip, versionNewer');
  assert.throws(() => decideReady({ npmHasVersion: false, commitIsMainTip: true }), (e) => e.code === 'fact-unreadable' && e.detail === 'versionNewer (not asked)');
});

test('through the doors: npm lacks it, the commit is the tip and the version the newest -> yes', async () => {
  const { answer, gitCalls } = await outcome({ [V]: json({}, 404), [PACKUMENT]: packument('0.13.0', '0.13.1') });
  assert.equal(answer, 'yes');
  assert.ok(gitCalls.includes('ls-remote origin refs/heads/main refs/heads/main^{}'), gitCalls.join('; '));
});

test('through the doors: a stale plan is refused by name (main moved on, a newer version published, both)', async () => {
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: packument('0.13.1') }, { mainTip: LATER })).answer, 'plan-stale commitIsMainTip');
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: packument('0.13.1', '0.14.0') })).answer, 'plan-stale versionNewer');
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: packument('0.13.1', '0.14.0') }, { mainTip: LATER })).answer, 'plan-stale commitIsMainTip, versionNewer');
});

test('through the doors: a fact that cannot be read is a refusal, with its cause', async () => {
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: packument('0.13.1') }, { mainTip: null })).answer, 'fact-unreadable commitIsMainTip (git-failed)');
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: json({}, 503) })).answer, 'fact-unreadable versionNewer (response-status)');
  // npm does not know the package at all: the version list was never read (the plan refuses this as package-unknown).
  assert.equal((await outcome({ [V]: json({}, 404), [PACKUMENT]: json({}, 404) })).answer, 'fact-unreadable versionNewer (package-unknown)');
});

test('through the doors: npm has it -> today\'s rule, and neither the tip nor the version list is asked', async () => {
  const equal = await outcome({ [V]: json(doc(integrityOf(local))), [TARBALL]: bytes(local) }, { mainTip: LATER });
  assert.equal(equal.answer, 'no');
  assert.deepEqual(equal.gitCalls, []);
  assert.deepEqual(equal.calls.map((call) => call.url), [V, TARBALL]);
  assert.equal((await outcome({ [V]: json(doc(integrityOf(Buffer.from('other')))) })).answer, 'registry-differs integrity');
  assert.equal((await outcome({ [V]: json(doc(integrityOf(local))), [TARBALL]: bytes(Buffer.from('other')) })).answer, 'registry-differs tarball bytes');
  assert.equal((await outcome({ [V]: json({}, 500) })).answer, 'response-status npm HTTP 500');
});
