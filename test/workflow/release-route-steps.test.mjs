// The SHAPE of every step (the second reader's N1): nine mutations of the publish job's steps
// (inspect turned off by `if: false` or `continue-on-error`, `working-directory: source`, which
// would run the CALLER's file named tool/scripts/... in the job that holds the publish right, a
// NODE_OPTIONS, `shell: sh`, a `registry-url`) left every structural test green. So:
// - a step may have only the keys name, id, if, uses, with, env, run, in every job of both files;
// - the plan and publish jobs are compared WHOLE, every key and value of every step, with what
//   this file states: a change to either is a deliberate edit of the expected value here;
// - no env names NODE_OPTIONS, NODE_PATH or npm_config_*; every setup-node has one input;
// - every script calls the tool by its absolute place, "$GITHUB_WORKSPACE/tool/...", so no working
//   directory can turn it into another file. The hold action stays `./tool/...` (a `./` action
//   resolves against the workspace, by GitHub's rule).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_ACTION, PINS, TOOL_GUARD, readWorkflow } from './support/route-workflow.mjs';

const route = readWorkflow('release-route.yml').yaml;
const check = readWorkflow('release-check.yml').yaml;
const everyStep = () => [['release-route.yml', route], ['release-check.yml', check]].flatMap(([file, yaml]) =>
  Object.entries(yaml.jobs).flatMap(([id, job]) => job.steps.map((step, i) => [`${file} ${id}[${i}] ${step.name}`, step])));

const use = (name) => `${name}@${PINS[name][0]}`;
const STEP = '"$GITHUB_WORKSPACE/tool/scripts/release-route.mjs"';
const CHART = '"$GITHUB_WORKSPACE/tool/scripts/release-route-chart.mjs"';
const TOOL_CHECKOUT = { name: 'Check out the release tool at this workflow\'s commit', uses: use('actions/checkout'),
  with: { repository: 'footprintjs/ci', ref: '${{ job.workflow_sha }}', path: 'tool', 'persist-credentials': false } };
const NODE_22 = { name: 'Node for the tool', uses: use('actions/setup-node'), with: { 'node-version': '22' } };
const HOLD_STEP = { name: 'Refuse while a hold-release label is open', uses: HOLD_ACTION };

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

const PUBLISH_STEPS = [
  TOOL_GUARD,
  TOOL_CHECKOUT,
  { name: 'Check out the caller at the planned commit (data for inspect)', uses: use('actions/checkout'),
    with: { ref: '${{ needs.plan.outputs.commit }}', path: 'source', 'persist-credentials': false } },
  NODE_22,
  { name: 'Fetch the built package', uses: use('actions/download-artifact'), with: { name: 'release-route-package', path: '${{ runner.temp }}/package' } },
  { name: 'Unpack the pinned npm in this job', env: { ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_SOURCE: 'source' }, run: `node ${STEP} npm-tool` },
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

test('a step has only the keys name, id, if, uses, with, env, run, in every job of both workflows', () => {
  const ALLOWED = ['name', 'id', 'if', 'uses', 'with', 'env', 'run'];
  for (const [where, step] of everyStep()) {
    for (const key of Object.keys(step)) assert.ok(ALLOWED.includes(key), `${where}: ${key}`);
    assert.equal(typeof step.name, 'string', where);
    assert.ok((step.uses === undefined) !== (step.run === undefined), `${where}: exactly one of uses and run`);
  }
});

test('the plan job\'s steps, whole', () => {
  assert.deepEqual(route.jobs.plan.steps, PLAN_STEPS);
});

test('the publish job\'s steps, whole: the one job that holds the publish right', () => {
  assert.deepEqual(route.jobs.publish.steps, PUBLISH_STEPS);
});

test('no env names NODE_OPTIONS, NODE_PATH or npm_config_*; every setup-node has exactly one input, node-version', () => {
  for (const [where, step] of everyStep()) {
    for (const name of Object.keys(step.env ?? {})) assert.doesNotMatch(name, /^(NODE_OPTIONS|NODE_PATH)$|^npm_config_/i, `${where}: ${name}`);
    if (String(step.uses).startsWith('actions/setup-node@')) assert.deepEqual(Object.keys(step.with), ['node-version'], where);
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
