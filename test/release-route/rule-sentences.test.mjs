// Correction 2: one sentence per rule row, not per mode. Rule `not-main-tip` used to print "nothing
// to do: the version is tagged and on npm" for a version that was neither (second reader, storydeck
// pull request 46), because step-common.mjs held one sentence per MODE. Now each row says what it
// decided (rules.mjs · `says`), and this file holds two things:
// - no two rows share a sentence (rows with different meanings cannot read alike);
// - no sentence states a fact its row does not require: each phrase below claims one fact value,
//   and a row whose sentence holds the phrase must require exactly that value in its `when`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportPlan } from '../../src/release-route/step-common.mjs';
import { plan } from '../../src/release-route/plan.mjs';
import { RULES, sentenceOf } from '../../src/release-route/rules.mjs';

// phrase -> the fact values a sentence holding it claims.
const CLAIMS = [
  [/\bis tagged\b|\bthe tag of this version (exists|names)\b|\bits tag names\b/, { tagExists: true }],
  [/\bwithout a tag\b|\bthere is no tag\b/, { tagExists: false }],
  [/\bnames this commit\b/, { tagAtCommit: true }],
  [/\bnames another commit\b|\bnot the one released\b/, { tagAtCommit: false }],
  [/\bon npm\b(?! without a tag)|\bnpm has (this|the) version\b/, { npmHasVersion: true }],
  [/\bnpm does not have\b/, { npmHasVersion: false }],
  [/\bhas its GitHub release\b/, { releaseExists: true }],
  [/\bwithout a (published )?GitHub release\b|\bthere is no (published )?GitHub release\b/, { releaseExists: false }],
  [/\bno longer the tip of main\b/, { refIsMain: true, commitIsMainTip: false }],
  // A claim that THIS commit is the tip (review, tests-4): "a publish from the tip of main" is not one.
  [/(?<!no longer )\bis the tip of main\b/, { refIsMain: true, commitIsMainTip: true }],
  // A promise about another run (review: finish-not-tip said "the run of the tip takes it up", which
  // no run does): a sentence may not say a later run writes or takes up anything.
  [/\btakes it up\b|\bthe run of the tip (writes|finishes)\b/, { never: true }],
  [/\bruns only from main\b/, { refIsMain: false }],
  [/^dry run\b/, { action: 'dry-run' }],
  [/\bwould publish\b/, { action: 'dry-run', tagExists: false, npmHasVersion: false }],
  [/\bmarks the package private\b/, { packagePrivate: true }],
  [/\bhas no name\b/, { packageNamed: false }],
  [/\bnot newer than\b/, { versionNewer: false }],
  [/\bno section\b/, { changelogFound: false }],
  [/\bnot plain\b/, { versionPlain: false }],
  [/\bdoes not know this package\b/, { packageKnown: false }],
  [/\bnot on footprintjs\/ci main\b/, { toolReviewed: false }],
  [/\bnot a full commit id\b/, { toolCommitPlain: false }],
  [/\bpins the release route at another commit\b/, { pinsAgree: false }],
  [/\bcould not be read\b/, { factsReadable: false }],
];

test('every row has its own sentence, and no two rows share one', () => {
  for (const rule of RULES) assert.ok(typeof rule.says === 'string' && rule.says.length > 10, rule.id);
  const sentences = RULES.map((rule) => rule.says);
  assert.equal(new Set(sentences).size, sentences.length, 'two rows share a sentence');
});

test('no sentence states a fact its row does not require', () => {
  for (const rule of RULES)
    for (const [phrase, claims] of CLAIMS)
      if (phrase.test(rule.says))
        for (const [name, value] of Object.entries(claims))
          assert.equal(rule.when[name], value, `${rule.id}: "${rule.says}" claims ${name}=${value}`);
});

test('the check above is not empty: every row whose sentence names a fact is held by at least one phrase', () => {
  const held = RULES.filter((rule) => CLAIMS.some(([phrase]) => phrase.test(rule.says)));
  // Only `publish` names no fact (it says what it will do).
  assert.deepEqual(RULES.filter((rule) => !held.includes(rule)).map((rule) => rule.id), ['publish']);
});

// Mutant 2c of the review: a sentence claiming this commit is the tip of main, on a row that does
// not require it, goes red.
test('the phrase check goes red on a claim about the tip the row does not require (review mutant 2c), and on a promise about another run', () => {
  const row = RULES.find((rule) => rule.id === 'recover-off-main');
  const claimed = (sentence) => CLAIMS.filter(([phrase]) => phrase.test(sentence)).flatMap(([, claims]) => Object.entries(claims))
    .filter(([name, value]) => row.when[name] !== value);
  assert.deepEqual(claimed('npm has this version without a tag, and this commit is the tip of main'), [['refIsMain', true], ['commitIsMainTip', true]]);
  assert.deepEqual(claimed(row.says), []);
  const notTip = RULES.find((rule) => rule.id === 'finish-not-tip');
  const old = 'nothing to do in this run: the version is tagged and on npm without a GitHub release, but this commit is no longer the tip of main; the run of the tip takes it up';
  assert.ok(CLAIMS.some(([phrase, claims]) => phrase.test(old) && claims.never), 'the old finish-not-tip sentence is caught');
  assert.ok(!CLAIMS.some(([phrase, claims]) => phrase.test(notTip.says) && claims.never));
});

test('the phrase check goes red on the old sentence: not-main-tip may not say the version is tagged and on npm', () => {
  const row = RULES.find((rule) => rule.id === 'not-main-tip');
  const old = 'nothing to do: the version is tagged and on npm';
  const broken = CLAIMS.filter(([phrase]) => phrase.test(old)).flatMap(([, claims]) => Object.entries(claims))
    .filter(([name, value]) => row.when[name] !== value);
  assert.deepEqual(broken, [['tagExists', true], ['npmHasVersion', true]]);
});

// The printed decision line carries the row's sentence, for a mode and for a refusal.
function printed(facts, version = '0.13.2') {
  const lines = [];
  const report = { say: (line) => lines.push(line), output: () => {} };
  try {
    reportPlan({ result: plan({ facts }), causes: {}, context: { commit: 'a'.repeat(40), name: 'p', version, node: '22', latest: 'yes' }, report });
  } catch {
    // a refusal: the decision line is printed before it is thrown
  }
  return lines.find((line) => line.startsWith('Decision: '));
}
const BASE = { action: 'publish', toolCommitPlain: true, toolReviewed: true, pinsAgree: true, settingsRead: true, packageNamed: true, packagePrivate: false,
  versionPlain: true, packageKnown: true, tagExists: false, tagAtCommit: false, releaseExists: false, npmHasVersion: false, changelogFound: true,
  versionNewer: true, refIsMain: true, commitIsMainTip: false };

test('the decision line of not-main-tip says what is true, and every printed line comes from its row', () => {
  const line = printed(BASE);
  assert.equal(line, 'Decision: rule not-main-tip gives mode nothing, nothing to do in this run: npm does not have this version, but this commit is no longer the tip of main; the run of the newer tip decides.');
  assert.doesNotMatch(line, /tagged/);
  assert.equal(printed({ ...BASE, commitIsMainTip: true, action: 'dry-run' }),
    'Decision: rule dry-run-would-publish gives mode dry-run, dry run: npm does not have 0.13.2; a publish from the tip of main would publish it.');
  assert.equal(printed({ ...BASE, packagePrivate: true }), 'Decision: rule package-private refuses not-publishable, package.json marks the package private.');
  for (const rule of RULES) assert.ok(rule.says.includes('{version}') || !sentenceOf(rule, '9.9.9').includes('9.9.9'), rule.id);
});
