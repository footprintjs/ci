// THE decision of the release route, as data. `plan.mjs` evaluates it; nothing else decides.
//
// FACTS names every fact and the values it may have. A fact that could not be read is null
// (observe.mjs records why), and `factsReadable` is false when any fact is outside its domain.
//
// RULES is an ordered table: each row is a set of equality tests over named facts (`when`) and
// either a mode (`mode` + `compare`: whether verify compares the built file with npm) or a
// refusal code (`refuse`). The FIRST row whose tests all hold decides, and its id is the
// printed reason. A row that matches facts a later row also matches, with a different result,
// must say so in `outranks` (a list of later ids, or 'later' for every later row); the test in
// test/release-route/plan.test.mjs fails on any overlap nobody declared.
//
// Why the order is what it is:
// - Refusals that need no other fact come first (the tool, the package, the version, npm
//   knowing the name). They may stand before `facts-unreadable` because refusing is always
//   safe; and some facts are not asked at all once one of them holds (no versions are read for
//   an unknown package), so they must come first to name the real reason.
// - `facts-unreadable` comes before EVERY row that yields a mode: no mode is ever chosen while
//   a fact is unknown.
// - Every mode that WRITES anything (WRITING_MODES: a publish, a tag, a GitHub release) needs
//   `refIsMain: true`; off main the same facts meet a named refusal row instead. A dry run
//   writes nothing and stays allowed from any branch. A test holds every writing row to this.
// - A missing CHANGELOG section stops `recover` too, not only `publish`: both write a GitHub
//   release whose notes come from that section. A dry run says the same, so it tells the truth
//   about what a publish would do.

export const FACTS = Object.freeze({
  action: Object.freeze(['publish', 'dry-run']),
  toolCommitPlain: Object.freeze([true, false]),
  toolReviewed: Object.freeze([true, false]),
  settingsRead: Object.freeze([true]),
  packageNamed: Object.freeze([true, false]),
  packagePrivate: Object.freeze([true, false]),
  versionPlain: Object.freeze([true, false]),
  packageKnown: Object.freeze([true, false]),
  tagExists: Object.freeze([true, false]),
  npmHasVersion: Object.freeze([true, false]),
  changelogFound: Object.freeze([true, false]),
  versionNewer: Object.freeze([true, false]),
  refIsMain: Object.freeze([true, false]),
});

// The modes that write: `publish` (npm, then the tag and release) and `recover` (the tag and
// release for a version npm already has). `nothing` and `dry-run` write nothing.
export const WRITING_MODES = Object.freeze(['publish', 'recover']);

const row = (value) => Object.freeze({ ...value, when: Object.freeze(value.when) });

export const RULES = Object.freeze([
  row({ id: 'tool-commit-invalid', when: { toolCommitPlain: false }, refuse: 'tool-commit-invalid', outranks: 'later' }),
  row({ id: 'tool-not-reviewed', when: { toolReviewed: false }, refuse: 'tool-not-reviewed', outranks: 'later' }),
  row({ id: 'package-unnamed', when: { packageNamed: false }, refuse: 'not-publishable', outranks: 'later' }),
  row({ id: 'package-private', when: { packagePrivate: true }, refuse: 'not-publishable', outranks: 'later' }),
  row({ id: 'version-not-plain', when: { versionPlain: false }, refuse: 'version-not-plain', outranks: 'later' }),
  row({ id: 'package-unknown', when: { packageKnown: false }, refuse: 'package-unknown', outranks: 'later' }),
  row({ id: 'facts-unreadable', when: { factsReadable: false }, refuse: 'fact-unreadable', outranks: 'later' }),

  row({ id: 'released', when: { tagExists: true, npmHasVersion: true, action: 'publish' }, mode: 'nothing', compare: 'no' }),
  row({ id: 'dry-run-released', when: { tagExists: true, npmHasVersion: true, action: 'dry-run' }, mode: 'dry-run', compare: 'yes' }),
  row({ id: 'tag-without-package', when: { tagExists: true, npmHasVersion: false }, refuse: 'tag-without-package' }),

  row({ id: 'changelog-missing', when: { tagExists: false, changelogFound: false }, refuse: 'changelog-missing',
    outranks: ['recover-off-main', 'recover', 'dry-run-recover', 'version-not-newer', 'publish-off-main', 'publish', 'dry-run-would-publish'] }),
  row({ id: 'recover-off-main', when: { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: false }, refuse: 'recover-off-main' }),
  row({ id: 'recover', when: { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: true }, mode: 'recover', compare: 'yes' }),
  row({ id: 'dry-run-recover', when: { tagExists: false, npmHasVersion: true, action: 'dry-run' }, mode: 'dry-run', compare: 'yes' }),

  row({ id: 'version-not-newer', when: { tagExists: false, npmHasVersion: false, versionNewer: false }, refuse: 'version-not-newer',
    outranks: ['publish-off-main', 'publish', 'dry-run-would-publish'] }),
  row({ id: 'publish-off-main', when: { tagExists: false, npmHasVersion: false, action: 'publish', refIsMain: false }, refuse: 'publish-off-main' }),
  row({ id: 'publish', when: { tagExists: false, npmHasVersion: false, action: 'publish', refIsMain: true }, mode: 'publish', compare: 'yes' }),
  row({ id: 'dry-run-would-publish', when: { tagExists: false, npmHasVersion: false, action: 'dry-run' }, mode: 'dry-run', compare: 'no' }),
]);
