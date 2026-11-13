// release-route.yml against "What the workflow must keep" (docs/RELEASE-ROUTE.md, W1 to W14),
// read as STRUCTURE with the strict YAML subset (support/yaml-subset.mjs), not grepped. The
// conditions between jobs (W7) are in release-route-conditions.test.mjs; release-check.yml in
// release-check.test.mjs. Each test names the rule it holds.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { RULES } from '../../src/release-route/rules.mjs';
import { parseCondition, pathsOf } from './support/expression.mjs';
import { HOLD_ACTION, PINS, RELEASE_CREATE, TOOL_GUARD, isCheckout, isToolCheckout, leaves, readWorkflow, stepNamed } from './support/route-workflow.mjs';
import { parseYaml } from './support/yaml-subset.mjs';

const { text, yaml } = readWorkflow('release-route.yml');
// The parsed file as one string: what a word search must look at (the comments may name what a job does NOT do).
const body = JSON.stringify(yaml);
const { jobs } = yaml;
const allSteps = () => Object.entries(jobs).flatMap(([id, job]) => job.steps.map((step) => [id, step]));
const runsOf = (job) => job.steps.filter((step) => typeof step.run === 'string');

test('a reusable workflow with ONE input, action, no secrets, no permissions of its own, no concurrency', () => {
  assert.deepEqual(Object.keys(yaml), ['name', 'on', 'permissions', 'defaults', 'jobs']);
  assert.deepEqual(Object.keys(yaml.on), ['workflow_call']);
  assert.deepEqual(Object.keys(yaml.on.workflow_call), ['inputs']);
  assert.deepEqual(Object.keys(yaml.on.workflow_call.inputs), ['action']);
  const { action } = yaml.on.workflow_call.inputs;
  assert.equal(action.required, true);
  assert.equal(action.type, 'string');
  assert.equal(Object.hasOwn(action, 'default'), false, 'no default: the caller says what it asks for');
  assert.deepEqual(yaml.permissions, {});
  assert.deepEqual(yaml.defaults, { run: { shell: 'bash' } });
  assert.doesNotMatch(body, /secrets|concurrency/, 'the caller keeps the concurrency group (W11); no secret is taken');
});

test('the jobs, in order, and what each needs', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(jobs).map(([id, job]) => [id, job.needs ?? null])),
    { plan: null, hold: 'plan', build: ['plan', 'hold'], publish: ['plan', 'build'], verify: ['plan', 'build', 'publish'], release: ['plan', 'verify'] });
});

test('least power: each job\'s permissions, exactly; id-token in the publish job only (W5, W6)', () => {
  const read = { contents: 'read' };
  const holdScopes = { contents: 'read', issues: 'read', 'pull-requests': 'read' };
  assert.deepEqual(Object.fromEntries(Object.entries(jobs).map(([id, job]) => [id, job.permissions])), {
    plan: read, hold: holdScopes, build: read,
    publish: { contents: 'read', 'id-token': 'write', issues: 'read', 'pull-requests': 'read' },
    verify: read, release: { contents: 'write' },
  });
  const idToken = [...leaves(yaml)].filter(([path]) => path.includes('id-token'));
  assert.deepEqual(idToken.map(([path]) => path.join('.')), ['jobs.publish.permissions.id-token']);
});

test('every job: the pinned runner image, a time limit, no environment of its own, no container', () => {
  for (const [id, job] of Object.entries(jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04', id);
    assert.ok(Number.isInteger(job['timeout-minutes']) && job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 60, id);
    for (const key of ['env', 'container', 'services', 'strategy', 'environment', 'continue-on-error', 'defaults'])
      assert.equal(Object.hasOwn(job, key), false, `${id} has ${key}`);
  }
});

test('every action is pinned by full commit, with its release in a comment; no other action', () => {
  const seen = new Set();
  for (const [id, step] of allSteps()) {
    if (step.uses === undefined) continue;
    if (step.uses === HOLD_ACTION) continue;
    const [name, sha] = step.uses.split('@');
    assert.ok(Object.hasOwn(PINS, name), `${id}: ${step.uses} is not an action this route allows`);
    assert.equal(sha, PINS[name][0], `${id}: ${name}`);
    seen.add(name);
  }
  assert.deepEqual([...seen].sort(), Object.keys(PINS).sort());
  for (const line of text.split('\n').filter((l) => /^\s*(- )?uses: /.test(l) && !l.includes(HOLD_ACTION))) {
    const [, name, sha, release] = /uses: ([^@]+)@([a-f0-9]{40}) # (v\d+\.\d+\.\d+)$/.exec(line) ?? [];
    assert.deepEqual([sha, release], PINS[name], line);
  }
  // release-check.yml uses the same pins, line for line.
  const check = readWorkflow('release-check.yml').text;
  for (const line of check.split('\n').filter((l) => /^\s*(- )?uses: /.test(l))) {
    const [, name, sha, release] = /uses: ([^@]+)@([a-f0-9]{40}) # (v\d+\.\d+\.\d+)$/.exec(line) ?? [];
    assert.deepEqual([sha, release], PINS[name], line);
  }
});

test('no cache restore or save anywhere (W5): no cache action, no cache input but setup-node\'s automatic cache turned off', () => {
  for (const [id, step] of allSteps()) {
    assert.doesNotMatch(String(step.uses ?? ''), /cache/, id);
    for (const [key, value] of Object.entries(step.with ?? {}))
      if (/cache/.test(key)) assert.deepEqual([key, value, String(step.uses).startsWith('actions/setup-node@')], ['package-manager-cache', false, true], `${id}: ${key}`);
  }
  assert.doesNotMatch(body.replaceAll('"package-manager-cache":false', ''), /cache/i);
});

test('every checkout leaves no credentials behind; the tool is footprintjs/ci at this workflow\'s commit, the caller at the planned commit', () => {
  for (const [id, step] of allSteps().filter(([, s]) => isCheckout(s))) {
    assert.equal(step.with['persist-credentials'], false, `${id}: ${step.name}`);
    if (isToolCheckout(step)) assert.deepEqual(step.with, { repository: 'footprintjs/ci', ref: '${{ job.workflow_sha }}', path: 'tool', 'persist-credentials': false });
    else assert.deepEqual(step.with, { ref: id === 'plan' ? '${{ github.sha }}' : '${{ needs.plan.outputs.commit }}', path: 'source', 'persist-credentials': false }, id);
  }
  for (const [id, job] of Object.entries(jobs)) assert.equal(job.steps.filter(isToolCheckout).length, 1, id);
});

test('W3: before any checkout, every job refuses a job.workflow_sha that is not 40 lowercase hex', () => {
  for (const [id, job] of Object.entries(jobs)) {
    assert.deepEqual(job.steps[0], TOOL_GUARD, id);
    assert.ok(job.steps.findIndex(isCheckout) > 0, id);
  }
  // The guard itself, run by bash as the runner runs it (shell: bash).
  for (const [value, code] of [['a'.repeat(40), 0], ['0123456789abcdef0123456789abcdef01234567', 0], ['', 1], ['main', 1], ['A'.repeat(40), 1],
    ['a'.repeat(39), 1], ['a'.repeat(41), 1], [`${'a'.repeat(40)}\n`, 1], [`${'a'.repeat(40)} `, 1], [`x${'a'.repeat(40)}`, 1]]) {
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', TOOL_GUARD.run], { env: { PATH: process.env.PATH, ROUTE_TOOL_SHA: value }, encoding: 'utf8' });
    assert.equal(result.status, code, JSON.stringify(value));
  }
  // ROUTE_TOOL_SHA is set from job.workflow_sha only.
  for (const [path, value] of leaves(yaml)) if (path.at(-1) === 'ROUTE_TOOL_SHA') assert.equal(value, '${{ job.workflow_sha }}', path.join('.'));
});

test('W1, W2: plan runs first in its own job; nothing before it runs repository code or touches git config, GIT_* or HOME', () => {
  const steps = jobs.plan.steps;
  const at = steps.findIndex((step) => step.id === 'plan');
  assert.deepEqual(steps.slice(0, at).map((step) => step.name),
    [TOOL_GUARD.name, 'Check out the caller at the commit being planned', 'Check out the release tool at this workflow\'s commit', 'Node for the tool']);
  assert.equal(steps[at].run, 'node "$GITHUB_WORKSPACE/tool/scripts/release-route-chart.mjs" plan');
  // ROUTE_SOURCE is the caller's checkout (at GITHUB_SHA), never the tool's.
  const caller = steps.find((step) => isCheckout(step) && !isToolCheckout(step));
  assert.equal(caller.with.ref, '${{ github.sha }}');
  assert.equal(steps[at].env.ROUTE_SOURCE, caller.with.path);
  assert.notEqual(steps[at].env.ROUTE_SOURCE, 'tool');
  for (const step of steps.slice(0, at + 1)) {
    for (const name of Object.keys(step.env ?? {})) assert.doesNotMatch(name, /^(GIT_|HOME$)/, `${step.name}: ${name}`);
    assert.doesNotMatch(String(step.run ?? ''), /git |insteadOf|HOME=/, step.name);
    assert.equal(step.with?.['fetch-depth'], undefined);
  }
  // No env at the workflow or job level could set them either.
  assert.equal(Object.hasOwn(yaml, 'env'), false);
});

test('W4: the build job hands on ONE artifact and nothing else; no job reads its outputs', () => {
  assert.equal(Object.hasOwn(jobs.build, 'outputs'), false);
  assert.doesNotMatch(body, /needs\.build\.outputs/);
  const uploads = jobs.build.steps.filter((step) => String(step.uses).startsWith('actions/upload-artifact@'));
  assert.deepEqual(uploads.map((step) => step.with), [{ name: 'release-route-package', path: '${{ runner.temp }}/out/package.tgz', 'retention-days': 30, 'if-no-files-found': 'error' }]);
  for (const [id, step] of allSteps().filter(([, s]) => String(s.uses).startsWith('actions/download-artifact@'))) {
    assert.ok(['publish', 'verify'].includes(id));
    assert.deepEqual(step.with, { name: 'release-route-package', path: '${{ runner.temp }}/package' });
  }
  // The package name carries no attempt number, so "Re-run failed jobs" reads the first attempt's.
  assert.doesNotMatch(JSON.stringify(uploads), /run_attempt/);
});

test('W5: the build job: contents read only, its steps in order, nothing after the build but the upload', () => {
  assert.deepEqual(jobs.build.steps.map((step) => step.name), [TOOL_GUARD.name, 'Check out the release tool at this workflow\'s commit',
    'Check out the caller at the planned commit', 'Node the settings name', 'Unpack the pinned npm', 'Build', 'Hand on the package (the one thing other jobs may read)']);
  assert.deepEqual(stepNamed(jobs.build, 'Node the settings name').with, { 'node-version': '${{ needs.plan.outputs.node }}', 'package-manager-cache': false });
  assert.deepEqual(stepNamed(jobs.build, 'Build').env, { ROUTE_COMMIT: '${{ needs.plan.outputs.commit }}', ROUTE_OUT: '${{ runner.temp }}/out',
    ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_SOURCE: 'source' });
  assert.doesNotMatch(JSON.stringify(jobs.build), /token|secret/i, 'no token reaches the job that runs the caller\'s code');
});

const PUBLISH_COMMAND = 'mkdir -m 700 -- "$ROUTE_EMPTY_DIR"\ncd -- "$ROUTE_EMPTY_DIR"\n' +
  'node "$ROUTE_NPM_DIR/package/bin/npm-cli.js" publish "$ROUTE_TARBALL_DIR/package.tgz" --ignore-scripts --provenance\n';

test('W6: the publish job installs nothing, runs no repository code, and publishes the inspected file from an empty folder', () => {
  const steps = jobs.publish.steps;
  assert.deepEqual(steps.map((step) => step.name), [TOOL_GUARD.name, 'Check out the release tool at this workflow\'s commit',
    'Check out the caller at the planned commit (data for inspect)', 'Node for the tool', 'Fetch the built package', 'Unpack the pinned npm in this job',
    'Inspect the package again', 'Ask npm whether to publish', 'Refuse while a hold-release label is open', 'Publish package.tgz']);
  // Every script is this repository's step, or the one publishing command; nothing else runs.
  const scripts = runsOf(jobs.publish).slice(1).map((step) => step.run);
  const step = (name) => `node "$GITHUB_WORKSPACE/tool/scripts/release-route.mjs" ${name}`;
  assert.deepEqual(scripts, [step('npm-tool'), step('inspect'), step('ready'), PUBLISH_COMMAND]);
  assert.doesNotMatch(JSON.stringify(jobs.publish), /npm (ci|install|run|exec)|npx|yarn|pnpm|corepack|node source|source\//);
  // npm-tool unpacks into a NEW folder under RUNNER_TEMP in this job, and the publish uses that folder.
  assert.deepEqual(stepNamed(jobs.publish, 'Unpack the pinned npm in this job').env, { ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_SOURCE: 'source' });
  const publish = stepNamed(jobs.publish, 'Publish package.tgz');
  assert.deepEqual(publish.env, { ROUTE_NPM_DIR: '${{ runner.temp }}/npm', ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_EMPTY_DIR: '${{ runner.temp }}/empty' });
  assert.equal(publish.if, "${{ steps.ready.outputs.publish == 'yes' }}");
  assert.deepEqual(stepNamed(jobs.publish, 'Inspect the package again').env,
    { ROUTE_COMMIT: '${{ needs.plan.outputs.commit }}', ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_SOURCE: 'source' });
});

// B1: the plan is never the proof. ready measures again, in the publish job, that the planned commit
// is still the tip of main (asked in the caller's checkout) and the version still the newest.
test('B1: the ready step gets exactly the five names it needs to measure the plan again', () => {
  assert.deepEqual(stepNamed(jobs.publish, 'Ask npm whether to publish').env, {
    ROUTE_PACKAGE: '${{ needs.plan.outputs.package }}', ROUTE_VERSION: '${{ needs.plan.outputs.version }}',
    ROUTE_TARBALL_DIR: '${{ runner.temp }}/package', ROUTE_COMMIT: '${{ needs.plan.outputs.commit }}', ROUTE_SOURCE: 'source' });
});

test('W6: the hold check runs as a STEP directly before the publishing step, from the tool at this workflow\'s commit', () => {
  const steps = jobs.publish.steps;
  const at = steps.findIndex((step) => step.name === 'Publish package.tgz');
  assert.deepEqual(steps[at - 1], { name: 'Refuse while a hold-release label is open', uses: HOLD_ACTION });
  assert.ok(steps.findIndex(isToolCheckout) < at - 1);
  // The hold job runs the same action, early (an early signal, not what holds on a re-run).
  assert.deepEqual(jobs.hold.steps.at(-1), { name: 'Refuse while a hold-release label is open', uses: HOLD_ACTION });
  // The action fixes its mode to publish and reads the job's token by default.
  const action = readFileSync('.github/actions/hold/action.yml', 'utf8');
  assert.match(action, /HOLD_MODE: publish\n/);
  assert.match(action, /default: \$\{\{ github\.token \}\}\n/);
});

test('W8, W9: the release job acts on tag\'s answers in the same job, create-only, the title as ONE argument, the notes never printed', () => {
  const steps = jobs.release.steps;
  assert.deepEqual(steps.slice(4).map((step) => [step.name, step.id ?? null, step.if ?? null]), [
    ['Ask about the tag and the GitHub release', 'tag', null],
    ['Write the release title and notes to files', null, null],
    // Correction 7: the tag is created only in the modes that verified npm's bytes first; finish never makes one.
    ['Create the tag', null, "${{ steps.tag.outputs.tag == 'create' && (needs.plan.outputs.mode == 'publish' || needs.plan.outputs.mode == 'recover') }}"],
    ['Create the GitHub release', null, "${{ steps.tag.outputs.release == 'create' }}"],
  ]);
  assert.equal(stepNamed(jobs.release, 'Create the tag').run,
    'gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" -f "ref=refs/tags/v$ROUTE_VERSION" -f "sha=$ROUTE_COMMIT" --silent');
  assert.equal(stepNamed(jobs.release, 'Create the GitHub release').run, RELEASE_CREATE);
  assert.equal(stepNamed(jobs.release, 'Ask about the tag and the GitHub release').env.ROUTE_MODE, '${{ needs.plan.outputs.mode }}');
  assert.equal(stepNamed(jobs.release, 'Write the release title and notes to files').env.ROUTE_OUT, stepNamed(jobs.release, 'Create the GitHub release').env.ROUTE_OUT);
  assert.doesNotMatch(body, /--force|-f force|force=|PATCH|git push|git tag/);
  // notes.md appears in exactly one place: the --notes-file argument.
  assert.equal(body.match(/notes\.md/g).length, 1);
  for (const [, step] of allSteps()) assert.doesNotMatch(String(step.run ?? ''), /\b(cat|echo|printf|head|tail|less|more)\b[^\n]*notes/);
});

// Correction 8: "Latest" on purpose. The release step, run by bash as the runner runs it, with `gh`
// standing in as a function that prints its arguments: yes gives --latest, no gives --latest=false,
// and anything else (empty, a cut value, a look-alike) creates nothing and exits 1.
test('the release step marks "Latest" only for the newest version, and refuses a latest that is not yes or no', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-latest-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'title.txt'), 'v1.4.0 \u2014 a title\n');
  const run = (latest) => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', `gh() { printf '<%s>' "$@"; }\n${RELEASE_CREATE}`],
    { env: { PATH: process.env.PATH, ROUTE_LATEST: latest, ROUTE_VERSION: '1.4.0', ROUTE_OUT: dir }, encoding: 'utf8' });
  const notes = `<--notes-file><${dir}/notes.md>`;
  assert.deepEqual([run('yes').status, run('yes').stdout], [0, `<release><create><v1.4.0><--verify-tag><--latest><--title><v1.4.0 \u2014 a title>${notes}`]);
  assert.deepEqual([run('no').status, run('no').stdout], [0, `<release><create><v1.4.0><--verify-tag><--latest=false><--title><v1.4.0 \u2014 a title>${notes}`]);
  for (const bad of ['', 'YES', 'true', 'yes ', 'n', 'no\n'])
    assert.deepEqual([run(bad).status, run(bad).stdout.includes('<create>')], [1, false], JSON.stringify(bad));
});

test('W10: no ${{ }} inside any run: line; every value reaches a script through env:', () => {
  for (const [id, step] of allSteps()) if (typeof step.run === 'string') assert.doesNotMatch(step.run, /\$\{\{/, `${id}: ${step.name}`);
  // Outside env:, an expression reads only closed alphabets or fixed contexts.
  const ALLOWED = {
    if: /^needs\.(plan|hold|build|publish|verify)\.result$|^needs\.plan\.outputs\.(mode|compare)$|^steps\.(ready\.outputs\.publish|tag\.outputs\.(tag|release))$/,
    with: /^(needs\.plan\.outputs\.(commit|node)|job\.workflow_sha|github\.sha|runner\.temp|github\.run_attempt)$/,
    env: /^(needs\.plan\.outputs\.(commit|package|version|mode|latest)|inputs\.action|job\.workflow_sha|runner\.temp|github\.(token|repository))$/,
    outputs: /^steps\.plan\.outputs\.(rule|commit|package|version|node|latest|compare|mode)$/,
  };
  for (const [path, value] of leaves(yaml)) {
    if (typeof value !== 'string' || !value.includes('${{')) continue;
    const where = path.includes('env') ? 'env' : path.includes('with') ? 'with' : path.at(-1) === 'if' ? 'if' : path.includes('outputs') ? 'outputs' : null;
    assert.ok(where, `an expression at ${path.join('.')}`);
    if (where === 'if') { for (const read of pathsOf(parseCondition(value))) assert.match(read, ALLOWED.if, path.join('.')); continue; }
    for (const [, inner] of value.matchAll(/\$\{\{ ([^}]*) \}\}/g)) assert.match(inner, ALLOWED[where], `${path.join('.')}: ${inner}`);
  }
});

// Correction 4: GitHub keeps one waiting run per concurrency group, so with one group per ref a manual
// dry run queued behind a running release cancelled a release push still waiting (second reader,
// storydeck pull request 46). Runs that may publish (a push, a dispatch of publish) share a group; a
// dry run has its own.
const CALLER_GROUP = "release-${{ github.ref }}-${{ github.event_name == 'push' && 'publish' || inputs.action }}";
test('W11: the caller in the doc keeps one run that may publish per ref at a time, never cancelling one in progress, and a dry run in its own group', () => {
  const doc = readFileSync('docs/RELEASE-ROUTE.md', 'utf8');
  const from = doc.indexOf('<!-- caller -->');
  const block = doc.slice(from, doc.indexOf('<!-- /caller -->'));
  const caller = parseYaml(/```yaml\n([\s\S]*?)```/.exec(block)[1]);
  assert.deepEqual(caller.concurrency, { group: CALLER_GROUP, 'cancel-in-progress': false });
  assert.deepEqual(caller.permissions, {});
  const [job] = Object.values(caller.jobs);
  assert.match(job.uses, /^footprintjs\/ci\/\.github\/workflows\/release-route\.yml@[a-f0-9]{40}$/);
  assert.deepEqual(job.permissions, { contents: 'write', 'id-token': 'write', issues: 'read', 'pull-requests': 'read' });
  // The caller passes exactly the route's inputs, and the action expression is the one the group reads.
  assert.deepEqual(Object.keys(job.with), Object.keys(yaml.on.workflow_call.inputs));
  assert.equal(job.with.action, "${{ github.event_name == 'push' && 'publish' || inputs.action }}");
  assert.ok(CALLER_GROUP.endsWith(`-${job.with.action}`));
  // The dispatch offers the two actions, dry-run by default.
  assert.deepEqual(caller.on.workflow_dispatch.inputs.action.options, ['dry-run', 'publish']);
  assert.equal(caller.on.workflow_dispatch.inputs.action.default, 'dry-run');
  assert.equal(Object.hasOwn(job, 'secrets'), false);
});

test('W12: ROUTE_OUT, ROUTE_TARBALL_DIR, ROUTE_NPM_DIR and ROUTE_RECORD_DIR are folders under RUNNER_TEMP, one per name per job', () => {
  const FOLDERS = ['ROUTE_OUT', 'ROUTE_TARBALL_DIR', 'ROUTE_NPM_DIR', 'ROUTE_RECORD_DIR', 'ROUTE_EMPTY_DIR'];
  for (const [id, job] of Object.entries(jobs)) {
    const byName = {};
    for (const step of job.steps)
      for (const [name, value] of Object.entries(step.env ?? {}))
        if (FOLDERS.includes(name)) {
          assert.match(value, /^\$\{\{ runner\.temp \}\}\/[a-z-]+$/, `${id}: ${name}`);
          (byName[name] ??= new Set()).add(value);
        }
    const values = Object.values(byName).map((set) => [...set]);
    for (const set of values) assert.equal(set.length, 1, `${id}: one folder per name`);
    assert.equal(new Set(values.flat()).size, values.length, `${id}: two names share a folder`);
  }
});

test('W13: the case it names (not the tip, npm has the version, no tag) is refused by the route itself', () => {
  const row = RULES.find((rule) => rule.id === 'unfinished-not-tip');
  assert.equal(row.refuse, 'release-unfinished');
  assert.deepEqual(row.when, { tagExists: false, npmHasVersion: true, action: 'publish', refIsMain: true, commitIsMainTip: false });
});

test('W14: plan and verify run charted only, with ROUTE_RECORD_DIR set, and their records are kept', () => {
  const scripts = allSteps().filter(([, step]) => typeof step.run === 'string' && /scripts\/release-route/.test(step.run));
  const charted = scripts.filter(([, step]) => step.run.includes('release-route-chart.mjs'));
  const chart = (name) => `node "$GITHUB_WORKSPACE/tool/scripts/release-route-chart.mjs" ${name}`;
  assert.deepEqual(charted.map(([id, step]) => [id, step.run]), [['plan', chart('plan')], ['verify', chart('verify')]]);
  for (const [, step] of charted) assert.match(step.env.ROUTE_RECORD_DIR, /^\$\{\{ runner\.temp \}\}\//);
  for (const [, step] of scripts.filter(([, s]) => !s.run.includes('release-route-chart.mjs')))
    assert.match(step.run, /^node "\$GITHUB_WORKSPACE\/tool\/scripts\/release-route\.mjs" (npm-tool|build|inspect|ready|tag|notes)$/);
  for (const [id, record] of [['plan', 'plan'], ['verify', 'verify']]) {
    const keep = jobs[id].steps.at(-1);
    assert.equal(keep.if, '${{ !cancelled() }}');
    assert.deepEqual(keep.with, { name: `release-route-${record}-record-\${{ github.run_attempt }}`, path: `\${{ runner.temp }}/${record}-record/`, 'retention-days': 90, 'if-no-files-found': 'warn' });
    assert.equal(keep.with.path, `${jobs[id].steps.at(-2).env.ROUTE_RECORD_DIR}/`);
  }
});

test('the plan job hands on exactly the plan step\'s outputs', () => {
  const NAMES = ['rule', 'commit', 'package', 'version', 'node', 'latest', 'compare', 'mode'];
  assert.deepEqual(jobs.plan.outputs, Object.fromEntries(NAMES.map((name) => [name, `\${{ steps.plan.outputs.${name} }}`])));
  assert.deepEqual(stepNamed(jobs.plan, 'Plan (charted)').env, { ROUTE_ACTION: '${{ inputs.action }}', ROUTE_TOOL_SHA: '${{ job.workflow_sha }}',
    ROUTE_SOURCE: 'source', ROUTE_RECORD_DIR: '${{ runner.temp }}/plan-record', GITHUB_TOKEN: '${{ github.token }}' });
});
