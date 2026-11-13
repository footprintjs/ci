// THE decision of the release route, as data. `plan.mjs` evaluates it; nothing else decides.
//
// FACTS names every fact and the values it may have. A fact that could not be read is null
// (observe.mjs records why), and `factsReadable` is false when any fact is outside its domain.
//
// RULES is an ordered table: each row is a set of equality tests over named facts (`when`) and
// either a mode (`mode` + `compare`: whether verify compares the built file with npm) or a
// refusal code (`refuse`). The FIRST row whose tests all hold decides, and its id is the
// printed reason. Each row also says what it decided in its own sentence (`says`), printed in the
// decision line and the job summary. Why one per row and not one per mode: `not-main-tip` and
// `released` are both mode `nothing`, and one sentence per mode printed "the version is tagged and
// on npm" for a version that was neither (second reader, storydeck pull request 46). A sentence
// states only facts its row requires; `{version}` is replaced by the planned version.
// A row that matches facts a later row also matches, with a different result, must say so in
// `outranks` (a list of later ids, or 'later' for every later row); the test in
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
//   `refIsMain: true` AND `commitIsMainTip: true`; off main the same facts meet a named refusal
//   row instead. A dry run writes nothing and stays allowed from any branch. A test holds every
//   writing row to this class rule.
// - `commitIsMainTip` is MEASURED (`git ls-remote origin refs/heads/main` equals the planned
//   commit), not told. Why: "Re-run" of an old run of main plans that run's OLD commit; with
//   the version still unreleased it would publish older code. A run of main whose commit is no
//   longer the tip, for a version npm does NOT have, is `nothing` (row `not-main-tip`): a newer
//   commit on main decides, and its own run plans. It is not a refusal, because an old run must
//   not turn red for being old; so it stands before the changelog and newer-version refusals
//   too (they are the tip's run to raise).
// - But not the tip with npm HAVING the version and no tag is unfinished work, not an old run:
//   the version was published from this commit and its release job never finished, and a later
//   run names it again only when the tip of main keeps the version (it then plans `recover` at
//   the tip, unless an earlier row refuses). Row `unfinished-not-tip` refuses
//   (`release-unfinished`), red on purpose, and the sentence says what to do (found by the second
//   reader, round 2).
// - A missing CHANGELOG section stops `recover` too, not only `publish`: both write a GitHub
//   release whose notes come from that section. A dry run says the same, so it tells the truth
//   about what a publish would do.
// - `pinsAgree` is a refusal that needs no other fact: every plain `uses:` line of the caller's
//   workflow files that names release-route.yml or release-check.yml pins the commit running; a
//   mention of either written any other way, or no route pin at all, is unreadable (pins.mjs).
// - A dry run of a released version compares the rebuild with npm only when the tag names THIS
//   commit (`tagAtCommit`). Between two releases a shipped file (package.json, the README) has
//   usually changed, so the rebuild of a later commit differs from npm by design: red that is not a
//   fault (storydeck runs 43334890647 and 43336400518). At another commit the dry run builds and
//   inspects, and compares nothing.
// - The route keeps the tag, npm and the GitHub release in step: a version that is tagged and on
//   npm but has no GitHub release (`releaseExists` false) is unfinished. On the tip of main, with
//   the tag at this very commit, mode `finish` writes only that release (the release job; the tag
//   step refuses to create a tag in this mode), and only with the version's CHANGELOG section,
//   which the release's notes come from (else changelog-missing). With the tag at another commit,
//   this run cannot finish it (the release job writes from the planned commit, and the tag step
//   refuses a tag elsewhere), so the plan refuses at once with `tag-elsewhere` and the row's
//   sentence gives the way out (WAY_OUT). Off the tip it is `nothing` (an old run does not turn
//   red for being old), and its sentence gives the same way out and promises nothing about
//   another run: a tip at another commit that keeps the version refuses tag-elsewhere, a tip that
//   raised the version never looks at this one again. Off main it is a named refusal, as for
//   publish and recover.
//   "Published": GitHub's endpoint for a tag's release answers only a published release, so a
//   draft reads as no release (github.mjs · readRelease).

export const FACTS = Object.freeze({
  action: Object.freeze(['publish', 'dry-run']),
  toolCommitPlain: Object.freeze([true, false]),
  toolReviewed: Object.freeze([true, false]),
  pinsAgree: Object.freeze([true, false]),
  settingsRead: Object.freeze([true]),
  packageNamed: Object.freeze([true, false]),
  packagePrivate: Object.freeze([true, false]),
  versionPlain: Object.freeze([true, false]),
  packageKnown: Object.freeze([true, false]),
  tagExists: Object.freeze([true, false]),
  tagAtCommit: Object.freeze([true, false]),
  releaseExists: Object.freeze([true, false]),
  npmHasVersion: Object.freeze([true, false]),
  changelogFound: Object.freeze([true, false]),
  versionNewer: Object.freeze([true, false]),
  refIsMain: Object.freeze([true, false]),
  commitIsMainTip: Object.freeze([true, false]),
});

// The modes that write: `publish` (npm, then the tag and release), `recover` (the tag and release
// for a version npm already has) and `finish` (only the GitHub release, for a tag that already
// exists at this commit and a version npm already has). `nothing` and `dry-run` write nothing.
export const WRITING_MODES = Object.freeze(['publish', 'recover', 'finish']);

const row = (value) => Object.freeze({ ...value, when: Object.freeze(value.when) });

// The facts every row about a version that is tagged and on npm, asked to publish, starts from.
const RELEASED = Object.freeze({ tagExists: true, npmHasVersion: true, action: 'publish' });
// The one way out when a tagged version has no published GitHub release and this run cannot write
// it (finish-not-tip, finish-tag-elsewhere): no later run writes it unless the tagged commit is the
// tip of main, where a run asked to publish plans finish. A tip at another commit that keeps the
// version refuses tag-elsewhere and names the gap; a tip that raised the version never looks at
// the old version again.
const WAY_OUT = 'write the release for that tag by hand, or, if the release job of the run that made the tag failed, use Re-run failed jobs on that run while GitHub still allows it';
const UNFINISHED = Object.freeze({ ...RELEASED, releaseExists: false });

export const RULES = Object.freeze([
  row({ id: 'tool-commit-invalid', when: { toolCommitPlain: false }, refuse: 'tool-commit-invalid', outranks: 'later',
    says: 'the release tool commit is not a full commit id' }),
  row({ id: 'tool-not-reviewed', when: { toolReviewed: false }, refuse: 'tool-not-reviewed', outranks: 'later',
    says: 'the release tool commit is not on footprintjs/ci main' }),
  row({ id: 'pins-differ', when: { pinsAgree: false }, refuse: 'pins-differ', outranks: 'later',
    says: 'a workflow file of this repository pins the release route at another commit than the one running' }),
  row({ id: 'package-unnamed', when: { packageNamed: false }, refuse: 'not-publishable', outranks: 'later',
    says: 'package.json has no name' }),
  row({ id: 'package-private', when: { packagePrivate: true }, refuse: 'not-publishable', outranks: 'later',
    says: 'package.json marks the package private' }),
  row({ id: 'version-not-plain', when: { versionPlain: false }, refuse: 'version-not-plain', outranks: 'later',
    says: 'the version is not plain x.y.z' }),
  row({ id: 'package-unknown', when: { packageKnown: false }, refuse: 'package-unknown', outranks: 'later',
    says: 'npm does not know this package' }),
  row({ id: 'facts-unreadable', when: { factsReadable: false }, refuse: 'fact-unreadable', outranks: 'later',
    says: 'a fact could not be read, so nothing is decided' }),

  row({ id: 'released', when: { ...RELEASED, releaseExists: true }, mode: 'nothing', compare: 'no',
    says: 'nothing to do: the version is tagged, on npm and has its GitHub release' }),
  row({ id: 'dry-run-released', when: { tagExists: true, npmHasVersion: true, action: 'dry-run', tagAtCommit: true }, mode: 'dry-run', compare: 'yes',
    says: 'dry run: the tag of this version names this commit and npm has the version; rebuild and compare with what npm serves' }),
  row({ id: 'dry-run-not-released-commit', when: { tagExists: true, npmHasVersion: true, action: 'dry-run', tagAtCommit: false }, mode: 'dry-run', compare: 'no',
    says: 'dry run: this commit is not the one released as this version (its tag names another commit), so nothing is compared with npm' }),
  row({ id: 'tag-without-package', when: { tagExists: true, npmHasVersion: false }, refuse: 'tag-without-package',
    says: 'the tag of this version exists but npm does not have the version' }),
  row({ id: 'finish-off-main', when: { ...UNFINISHED, refIsMain: false }, refuse: 'finish-off-main',
    says: 'the version is tagged and on npm without a published GitHub release, and writing that release runs only from main' }),
  row({ id: 'finish-not-tip', when: { ...UNFINISHED, refIsMain: true, commitIsMainTip: false }, mode: 'nothing', compare: 'no',
    says: `nothing to do in this run: the version is tagged and on npm without a published GitHub release, but this commit is no longer the tip of main; ${WAY_OUT}` }),
  row({ id: 'finish-tag-elsewhere', when: { ...UNFINISHED, refIsMain: true, commitIsMainTip: true, tagAtCommit: false }, refuse: 'tag-elsewhere',
    says: `the version is tagged and on npm without a published GitHub release, and its tag names another commit than this one; ${WAY_OUT}` }),
  row({ id: 'finish-changelog-missing', when: { ...UNFINISHED, refIsMain: true, commitIsMainTip: true, tagAtCommit: true, changelogFound: false },
    refuse: 'changelog-missing',
    says: 'the tag of this version names this commit and npm has the version, but there is no published GitHub release and CHANGELOG.md has no section for this version to write it from' }),
  row({ id: 'finish', when: { ...UNFINISHED, refIsMain: true, commitIsMainTip: true, tagAtCommit: true, changelogFound: true }, mode: 'finish', compare: 'no',
    says: 'the tag of this version names this commit and npm has the version, but there is no published GitHub release: write the release for the existing tag' }),

  row({ id: 'not-main-tip', when: { tagExists: false, npmHasVersion: false, action: 'publish', refIsMain: true, commitIsMainTip: false },
    mode: 'nothing', compare: 'no', outranks: ['changelog-missing', 'version-not-newer'],
    says: 'nothing to do in this run: npm does not have this version, but this commit is no longer the tip of main; the run of the newer tip decides' }),
  row({ id: 'unfinished-not-tip', when: { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: true, commitIsMainTip: false },
    refuse: 'release-unfinished', outranks: ['changelog-missing'],
    says: 'npm has this version without a tag, and this commit is no longer the tip of main' }),
  row({ id: 'changelog-missing', when: { tagExists: false, changelogFound: false }, refuse: 'changelog-missing',
    outranks: ['recover-off-main', 'recover', 'dry-run-recover', 'version-not-newer', 'publish-off-main', 'publish', 'dry-run-would-publish'],
    says: 'CHANGELOG.md has no section for this version' }),
  row({ id: 'recover-off-main', when: { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: false }, refuse: 'recover-off-main',
    says: 'npm has this version without a tag, and writing the tag runs only from main' }),
  row({ id: 'recover', when: { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: true, commitIsMainTip: true }, mode: 'recover', compare: 'yes',
    says: 'npm has this version but there is no tag: rebuild, compare with npm, then tag and release' }),
  row({ id: 'dry-run-recover', when: { tagExists: false, npmHasVersion: true, action: 'dry-run' }, mode: 'dry-run', compare: 'yes',
    says: 'dry run: npm has this version without a tag; rebuild and compare with what npm serves' }),

  row({ id: 'version-not-newer', when: { tagExists: false, npmHasVersion: false, versionNewer: false }, refuse: 'version-not-newer',
    outranks: ['publish-off-main', 'publish', 'dry-run-would-publish'],
    says: 'the version is not newer than every version npm has' }),
  row({ id: 'publish-off-main', when: { tagExists: false, npmHasVersion: false, action: 'publish', refIsMain: false }, refuse: 'publish-off-main',
    says: 'npm does not have this version, and a real publish runs only from main' }),
  row({ id: 'publish', when: { tagExists: false, npmHasVersion: false, action: 'publish', refIsMain: true, commitIsMainTip: true }, mode: 'publish', compare: 'yes',
    says: 'publish {version}, then verify, tag and release' }),
  row({ id: 'dry-run-would-publish', when: { tagExists: false, npmHasVersion: false, action: 'dry-run' }, mode: 'dry-run', compare: 'no',
    says: 'dry run: npm does not have {version}; a publish from the tip of main would publish it' }),
]);

// What a row says, with the planned version in place of `{version}` (the version is a plain x.y.z
// whenever a row is reached that names it: version-not-plain stands before them).
export const sentenceOf = (rule, version) => rule.says.replaceAll('{version}', version ?? 'this version');
