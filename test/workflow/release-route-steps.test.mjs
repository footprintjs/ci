// The SHAPE of every step (the second reader's N1): nine mutations of the publish job's steps
// (inspect turned off by `if: false` or `continue-on-error`, `working-directory: source`, which
// would run the CALLER's file named tool/scripts/... in the job that holds the publish right, a
// NODE_OPTIONS, `shell: sh`, a `registry-url`) left every structural test green. So:
// - a step may have only the keys name, id, if, uses, with, env, run, in every job of both files;
// - EVERY job of both files is compared WHOLE, every key and value of every step, with what this
//   file states: a change to any of them is a deliberate edit of the expected value here. (Round 2
//   of the second read, F1: `if: false` on "Verify (charted)" passed every test while only the plan
//   and publish jobs were held, and the release job would have tagged on a verify that compared
//   nothing.) release-check.yml's one job is held against the plan steps below as well;
// - a job has only the keys needs, if, runs-on, timeout-minutes, permissions, outputs (the plan job
//   of release-route.yml only) and steps, so a key the other tests do not name is refused too;
// - no env names NODE_OPTIONS, NODE_PATH or npm_config_*; every setup-node has one input;
// - every script calls the tool by its absolute place, "$GITHUB_WORKSPACE/tool/...", so no working
//   directory can turn it into another file. The hold action stays `./tool/...` (a `./` action
//   resolves against the workspace, by GitHub's rule).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_ACTION, PINS, RELEASE_CREATE, SETUP_NODE_WITH, TOOL_GUARD, readWorkflow } from './support/route-workflow.mjs';

const route = readWorkflow('release-route.yml').yaml;
const check = readWorkflow('release-check.yml').yaml;
const everyStep = () => [['release-route.yml', route], ['release-check.yml', check]].flatMap(([file, yaml]) =>
  Object.entries(yaml.jobs).flatMap(([id, job]) => job.steps.map((step, i) => [`${file} ${id}[${i}] ${step.name}`, step])));

const use = (name) => `${name}@${PINS[name][0]}`;
const STEP = '"$GITHUB_WORKSPACE/tool/scripts/release-route.mjs"';
const CHART = '"$GITHUB_WORKSPACE/tool/scripts/release-route-chart.mjs"';
const TOOL_CHECKOUT = { name: 'Check out the release tool at this workflow\'s commit', uses: use('actions/checkout'),
  with: { repository: 'footprintjs/ci', ref: '${{ job.workflow_sha }}', path: 'tool', 'persist-credentials': false } };
const NODE_22 = { name: 'Node for the tool', uses: use('actions/setup-node'), with: { 'node-version': '22', 'package-manager-cache': false } };
const HOLD_STEP = { name: 'Refuse while a hold-release label is open', uses: HOLD_ACTION };
const FETCH = { name: 'Fetch the built package', uses: use('actions/download-artifact'), with: { name: 'release-route-package', path: '${{ runner.temp }}/package' } };
const PLANNED = '${{ needs.plan.outputs.commit }}';
const CALLER_AT_PLANNED = (name) => ({ name, uses: use('actions/checkout'), with: { ref: PLANNED, path: 'source', 'persist-credentials': false } });
const UNPACK_NPM = (name) => ({ name, env: { ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_SOURCE: 'source' }, run: `node ${STEP} npm-tool` });

const PLAN_STEPS = [
  TOOL_GUARD,
  { name: 'Check out the caller at the commit being planned', uses: use('actions/checkout'),
    with: { ref: '${{ github.sha }}', path: 'source', 'persist-credentials': false } },
  TOOL_CHECKOUT,
  NODE_22,
  { name: 'Plan (charted)', id: 'plan',
    env: { ROUTE_ACTION: '${{ inputs.action }}', ROUTE_TOOL_SHA: '${{ job.workflow_sha }}', ROUTE_SOURCE: 'source',
      ROUTE_RECORD_DIR: '${{ runner.temp }}/plan-record', GITHUB_TOKEN: '${{ github.token }}' },
    run: `node ${CHART} plan` },
  { name: 'Keep the plan\'s record', if: '${{ !cancelled() }}', uses: use('actions/upload-artifact'),
    with: { name: 'release-route-plan-record-${{ github.run_attempt }}', path: '${{ runner.temp }}/plan-record/', 'retention-days': 90, 'if-no-files-found': 'warn' } },
];

const HOLD_STEPS = [TOOL_GUARD, TOOL_CHECKOUT, NODE_22, HOLD_STEP];

const BUILD_STEPS = [
  TOOL_GUARD,
  TOOL_CHECKOUT,
  CALLER_AT_PLANNED('Check out the caller at the planned commit'),
  { name: 'Node the settings name', uses: use('actions/setup-node'), with: { 'node-version': '${{ needs.plan.outputs.node }}', 'package-manager-cache': false } },
  UNPACK_NPM('Unpack the pinned npm'),
  { name: 'Build', env: { ROUTE_COMMIT: PLANNED, ROUTE_OUT: '${{ runner.temp }}/out', ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_SOURCE: 'source' },
    run: `node ${STEP} build` },
  { name: 'Hand on the package (the one thing other jobs may read)', uses: use('actions/upload-artifact'),
    with: { name: 'release-route-package', path: '${{ runner.temp }}/out/package.tgz', 'retention-days': 30, 'if-no-files-found': 'error' } },
];

const PUBLISH_STEPS = [
  TOOL_GUARD,
  TOOL_CHECKOUT,
  CALLER_AT_PLANNED('Check out the caller at the planned commit (data for inspect)'),
  NODE_22,
  FETCH,
  UNPACK_NPM('Unpack the pinned npm in this job'),
  { name: 'Inspect the package again',
    env: { ROUTE_COMMIT: '${{ needs.plan.outputs.commit }}', ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_SOURCE: 'source' },
    run: `node ${STEP} inspect` },
  { name: 'Ask npm whether to publish', id: 'ready',
    env: { ROUTE_PACKAGE: '${{ needs.plan.outputs.package }}', ROUTE_VERSION: '${{ needs.plan.outputs.version }}',
      ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_COMMIT: '${{ needs.plan.outputs.commit }}', ROUTE_SOURCE: 'source' },
    run: `node ${STEP} ready` },
  HOLD_STEP,
  { name: 'Publish package.tgz', if: "${{ steps.ready.outputs.publish == 'yes' }}",
    env: { ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_EMPTY_DIR: '${{ runner.temp }}/empty' },
    run: 'mkdir -m 700 -- "$ROUTE_EMPTY_DIR"\ncd -- "$ROUTE_EMPTY_DIR"\n' +
      'node "$ROUTE_NPM_DIR/package/bin/npm-cli.js" publish "$ROUTE_TARBALL_DIR/package.tgz" --ignore-scripts --provenance\n' },
];

const VERIFY_STEPS = [
  TOOL_GUARD,
  TOOL_CHECKOUT,
  NODE_22,
  FETCH,
  { name: 'Verify (charted)',
    env: { ROUTE_PACKAGE: '${{ needs.plan.outputs.package }}', ROUTE_VERSION: '${{ needs.plan.outputs.version }}',
      ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_RECORD_DIR: '${{ runner.temp }}/verify-record' },
    run: `node ${CHART} verify` },
  { name: 'Keep the verify record', if: '${{ !cancelled() }}', uses: use('actions/upload-artifact'),
    with: { name: 'release-route-verify-record-${{ github.run_attempt }}', path: '${{ runner.temp }}/verify-record/', 'retention-days': 90, 'if-no-files-found': 'warn' } },
];

const RELEASE_STEPS = [
  TOOL_GUARD,
  TOOL_CHECKOUT,
  CALLER_AT_PLANNED('Check out the caller at the planned commit'),
  NODE_22,
  { name: 'Ask about the tag and the GitHub release', id: 'tag',
    env: { ROUTE_COMMIT: PLANNED, ROUTE_VERSION: '${{ needs.plan.outputs.version }}', ROUTE_MODE: '${{ needs.plan.outputs.mode }}', ROUTE_SOURCE: 'source',
      GITHUB_TOKEN: '${{ github.token }}' },
    run: `node ${STEP} tag` },
  { name: 'Write the release title and notes to files',
    env: { ROUTE_COMMIT: PLANNED, ROUTE_OUT: '${{ runner.temp }}/notes', ROUTE_SOURCE: 'source' },
    run: `node ${STEP} notes` },
  { name: 'Create the tag', if: "${{ steps.tag.outputs.tag == 'create' && (needs.plan.outputs.mode == 'publish' || needs.plan.outputs.mode == 'recover') }}",
    env: { GH_TOKEN: '${{ github.token }}', ROUTE_COMMIT: PLANNED, ROUTE_VERSION: '${{ needs.plan.outputs.version }}' },
    run: 'gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" -f "ref=refs/tags/v$ROUTE_VERSION" -f "sha=$ROUTE_COMMIT" --silent' },
  { name: 'Create the GitHub release', if: "${{ steps.tag.outputs.release == 'create' }}",
    env: { GH_TOKEN: '${{ github.token }}', GH_REPO: '${{ github.repository }}', ROUTE_VERSION: '${{ needs.plan.outputs.version }}',
      ROUTE_LATEST: '${{ needs.plan.outputs.latest }}', ROUTE_OUT: '${{ runner.temp }}/notes' },
    run: RELEASE_CREATE },
];

test('a step has only the keys name, id, if, uses, with, env, run, in every job of both workflows', () => {
  const ALLOWED = ['name', 'id', 'if', 'uses', 'with', 'env', 'run'];
  for (const [where, step] of everyStep()) {
    for (const key of Object.keys(step)) assert.ok(ALLOWED.includes(key), `${where}: ${key}`);
    assert.equal(typeof step.name, 'string', where);
    assert.ok((step.uses === undefined) !== (step.run === undefined), `${where}: exactly one of uses and run`);
  }
});

test('a job has only the keys needs, if, runs-on, timeout-minutes, permissions, outputs (the route\'s plan job only) and steps', () => {
  const ALLOWED = ['needs', 'if', 'runs-on', 'timeout-minutes', 'permissions', 'outputs', 'steps'];
  for (const [file, yaml] of [['release-route.yml', route], ['release-check.yml', check]])
    for (const [id, job] of Object.entries(yaml.jobs))
      for (const key of Object.keys(job)) {
        assert.ok(ALLOWED.includes(key), `${file} ${id}: ${key}`);
        if (key === 'outputs') assert.equal(`${file} ${id}`, 'release-route.yml plan', 'outputs belong to the route\'s plan job only');
      }
});

test('the plan job\'s steps, whole', () => {
  assert.deepEqual(route.jobs.plan.steps, PLAN_STEPS);
});

test('release-check.yml\'s one job: the plan steps, whole, with the action dry-run and the record under its own name', () => {
  const expected = structuredClone(PLAN_STEPS);
  expected.find((step) => step.id === 'plan').env.ROUTE_ACTION = 'dry-run';
  expected.at(-1).with.name = 'release-check-plan-record-${{ github.run_attempt }}';
  assert.deepEqual(check.jobs.plan.steps, expected);
});

test('the hold job\'s steps, whole', () => {
  assert.deepEqual(route.jobs.hold.steps, HOLD_STEPS);
});

test('the build job\'s steps, whole: the one job that runs the caller\'s code', () => {
  assert.deepEqual(route.jobs.build.steps, BUILD_STEPS);
});

test('the publish job\'s steps, whole: the one job that holds the publish right', () => {
  assert.deepEqual(route.jobs.publish.steps, PUBLISH_STEPS);
});

test('the verify job\'s steps, whole: the comparison the release job\'s tag rests on', () => {
  assert.deepEqual(route.jobs.verify.steps, VERIFY_STEPS);
});

test('the release job\'s steps, whole: the job that writes the tag and the GitHub release', () => {
  assert.deepEqual(route.jobs.release.steps, RELEASE_STEPS);
});

test('no env names NODE_OPTIONS, NODE_PATH or npm_config_*; every setup-node has exactly node-version and package-manager-cache: false', () => {
  for (const [where, step] of everyStep()) {
    for (const name of Object.keys(step.env ?? {})) assert.doesNotMatch(name, /^(NODE_OPTIONS|NODE_PATH)$|^npm_config_/i, `${where}: ${name}`);
    if (String(step.uses).startsWith('actions/setup-node@')) {
      assert.deepEqual(Object.keys(step.with), SETUP_NODE_WITH, where);
      assert.equal(step.with['package-manager-cache'], false, where);
    }
  }
});

test('every script calls the tool by its absolute place; no relative tool path is left', () => {
  for (const [where, step] of everyStep()) {
    if (typeof step.run !== 'string') continue;
    assert.doesNotMatch(step.run, /(^|[\s"'])(\.\/)?tool\//, `${where}: a relative tool path`);
    for (const [call] of step.run.matchAll(/scripts\/release-route[\w-]*\.mjs/g))
      assert.ok(step.run.includes(`"$GITHUB_WORKSPACE/tool/${call}"`), `${where}: ${call}`);
  }
  // Every step that runs a script and is not the guard, the publish or a gh call runs the tool.
  for (const [where, step] of everyStep())
    if (typeof step.run === 'string' && !/^(\[\[|mkdir|gh |title=)/.test(step.run))
      assert.match(step.run, /^node "\$GITHUB_WORKSPACE\/tool\/scripts\/release-route(-chart)?\.mjs" [a-z-]+$/, where);
});
