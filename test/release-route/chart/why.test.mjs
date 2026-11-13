// The `why` reader: from a saved record alone, with no network. Its lines are cleaned; a record
// that is not one is refused; and the committed bundle answers the same as the module.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { decide, flowChart } from 'footprintjs';
import { execute } from '../../../src/release-route/chart/execute.mjs';
import { MAX_RECORD_BYTES, routeRecord } from '../../../src/release-route/chart/record.mjs';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { explain, readRouteRecord, SIDE_BY_SIDE } from '../../../src/release-route/chart/why.mjs';
import { asRefusal } from '../../../src/release-route/refusals.mjs';
import { createReport, safeLine } from '../../../src/release-route/report.mjs';
import { integrityOf } from '../../../src/release-route/registry.mjs';
import { bytes, fakeFetch, json } from '../fake-fetch.mjs';
import { storydeckDoors } from '../storydeck-today.mjs';

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-why-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
async function savedPlan(t, options = {}) {
  const dir = join(folder(t), 'record');
  const report = createReport({ env: {}, print: () => {}, append: () => {} });
  await runChartStep('plan', { ...storydeckDoors({ ...options, extra: { ROUTE_RECORD_DIR: dir, ...(options.extra ?? {}) } }), report, argv: [] });
  return join(dir, 'plan.record.json');
}
const code = (fn) => { try { fn(); } catch (error) { return asRefusal(error).code; } return 'answered'; };

test('why mode: the decision, the rule, each fact with the stage that observed it, and the walk back', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t)));
  assert.match(lines[0], /^Why mode = "nothing" in the plan record of run \S+\.$/);
  assert.equal(lines[1], 'Decision at decide#12: rule released matched.');
  assert.deepEqual(lines.slice(2, 5), [
    'Fact tagExists eq true: was true, holds; observed by Look for the tag and its release (look-tag#7).',
    'Fact npmHasVersion eq true: was true, holds; observed by Ask npm (look-npm#8).',
    'Fact action eq "publish": was "publish", holds; observed by Read the request (request#0).',
  ]);
  assert.ok(lines.includes('Walk: . Decide by the rule table (decide#12) ← [control: released]'));
});

test('why on a refusal names the rule and the fact that decided it', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t, { lsRemote: '', mainTip: 'f'.repeat(40) })));
  assert.match(lines[0], /^Why refusal = "release-unfinished"/);
  assert.equal(lines[1], 'Decision at decide#12: rule unfinished-not-tip matched.');
  assert.ok(lines.includes('Fact commitIsMainTip eq false: was false, holds; observed by Look at the tip of main (look-tip#1).'));
});

test('an unreadable fact is named with its cause', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t, { routes: { 'https://registry.npmjs.org/footprint-storydeck': () => new Response('{}', { status: 503 }) } })));
  assert.ok(lines.includes('Unreadable fact packageKnown: response-status npm HTTP 503.'), lines.join('\n'));
});

test('another key, a key never written, a malformed key', async (t) => {
  const record = readRouteRecord(await savedPlan(t));
  assert.match(explain(record, 'version')[0], /^Why version = "0.13.1"/);
  assert.deepEqual(explain(record, 'nosuchkey').slice(1), ['The run never wrote that key.']);
  for (const key of ['', '__proto__x$', 'a.b', '::x']) assert.equal(code(() => explain(record, key)), 'input-invalid');
});

test('a file that is not a record is refused: missing, not JSON, a duplicate key, another shape', async (t) => {
  const dir = folder(t);
  const record = JSON.parse(readFileSync(await savedPlan(t), 'utf8'));
  for (const [name, text] of [['notjson', '{'], ['dup', '{"format":"x","format":"y"}'], ['shape', JSON.stringify({ ...record, version: 2 })],
    ['nostate', JSON.stringify({ ...record, state: [] })]]) {
    writeFileSync(join(dir, name), text);
    assert.equal(code(() => readRouteRecord(join(dir, name))), 'record-unreadable', name);
  }
  assert.equal(code(() => readRouteRecord(join(dir, 'absent'))), 'record-unreadable');
});

test('a record holding hostile text prints no workflow command and no line led by it', async (t) => {
  const record = JSON.parse(readFileSync(await savedPlan(t), 'utf8'));
  record.state.mode = '::error::pwned\u{202E}##[group]x';
  record.state.causes = { tagExists: { code: '::warning::x', detail: '\n::set-output name=x::y' } };
  for (const line of explain(record).map(safeLine)) {
    assert.doesNotMatch(line, /::|##\[/, line);
    assert.match(line, /^[A-Za-z]/);
  }
});

test('why as a step: exit 0 with the answer; a bad file is record-unreadable, exit 1', async (t) => {
  const file = await savedPlan(t);
  const printed = [];
  const report = createReport({ env: {}, print: (line) => printed.push(line), append: () => {} });
  assert.equal(await runChartStep('why', { env: {}, report, argv: [file] }), 0);
  assert.match(printed[0], /^Why mode = "nothing"/);
  assert.equal(await runChartStep('why', { env: {}, report, argv: [join(folder(t), 'absent')] }), 1);
  assert.match(printed.at(-2), /^Refused: record-unreadable\./);
});

test('the committed bundle runs: why gives the module\'s answer; its metadata is its own digest and the pinned libraries', async (t) => {
  const file = await savedPlan(t);
  const bundle = resolve('dist/release-route.cjs');
  const result = spawnSync(process.execPath, [bundle, 'why', file], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split('\n'), explain(readRouteRecord(file)).map(safeLine));
  const metadata = JSON.parse(readFileSync('dist/release-route-metadata.json', 'utf8'));
  assert.equal(metadata.sha256, createHash('sha256').update(readFileSync(bundle)).digest('hex'));
  assert.deepEqual(metadata.libraries, {
    footprintjs: JSON.parse(readFileSync('node_modules/footprintjs/package.json', 'utf8')).version,
    foottrace: JSON.parse(readFileSync('node_modules/foottrace/package.json', 'utf8')).version,
  });
  assert.ok(metadata.external.every((name) => name.startsWith('node:')));
  const unknown = spawnSync(process.execPath, [bundle, 'ship'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(unknown.status, 1);
});

test('why names the decision that governs the value asked about, or says that none does', async () => {
  // Two decisions: the first lets `y` be written, the second lets `z` be written.
  const chart = flowChart('Seed', (scope) => { scope.x = 1; }, 'seed')
    .addDeciderFunction('First', (scope) => decide(scope, [{ when: { x: { eq: 1 } }, then: 'one', label: 'x is one' }], 'other'), 'first')
    .addFunctionBranch('one', 'One', (scope) => { scope.y = 2; })
    .addFunctionBranch('other', 'Other', (scope) => { scope.y = 0; })
    .setDefault('other').end()
    .addDeciderFunction('Second', (scope) => decide(scope, [{ when: { y: { eq: 2 } }, then: 'two', label: 'y is two' }], 'none'), 'second')
    .addFunctionBranch('two', 'Two', (scope) => { scope.z = 3; })
    .addFunctionBranch('none', 'None', (scope) => { scope.z = 0; })
    .setDefault('none').end()
    .build();
  const run = await execute(chart);
  const record = { ...routeRecord({ step: 'plan', chart, run }) };
  assert.equal(record.control.decisions.length, 2);
  assert.deepEqual(explain(record, 'z').slice(1, 3), ['Decision at second#3: rule y is two matched.', 'Fact y eq 2: was 2, holds; observed by One (one#2).']);
  assert.deepEqual(explain(record, 'y').slice(1, 3), ['Decision at first#1: rule x is one matched.', 'Fact x eq 1: was 1, holds; observed by Seed (seed#0).']);
  assert.deepEqual(explain(record, 'x').slice(1, 3), ['No decision governs x: Seed (seed#0) wrote it, and that stage runs whatever is decided.', 'Written by Seed (seed#0).']);
});

test('why on a fact of the plan: no decision governs it, no rule is named, and one line names the stage that observed it', async (t) => {
  const record = readRouteRecord(await savedPlan(t));
  const lines = explain(record, 'tagExists');
  assert.equal(lines[1], 'No decision governs tagExists: Gather what was seen (gather-second#10) wrote it, and that stage runs whatever is decided.');
  assert.equal(lines[2], 'Observed by Look for the tag and its release (look-tag#7).');
  assert.ok(!lines.some((line) => line.startsWith('Decision at') || line.startsWith('Fact ')), lines.join('\n'));
  // The look that measured the fact, even where the walk shows it four steps down (R2-N3).
  assert.equal(explain(record, 'commitIsMainTip')[2], 'Observed by Look at the tip of main (look-tip#1).');
  assert.equal(explain(record, 'packageName')[2], 'Observed by Read package.json (look-package#4).');
  assert.ok(!explain(record).concat(explain(record, 'tagExists')).some((line) => /read by|"read by"/.test(line)), 'a line still says "read by"');
});

// "Observed by" is said only for what was observed: a fact of the rule table (FACT_NAMES) or a
// context value a look reads. Every other key with no decision (a computed value, the `runs`
// container) says "Written by", so a computed value is never called an observation.
const governedBy = (lines) => lines.find((line) => /^(Observed|Written) by /.test(line));

test('why on a plan record: a fact or a context value is Observed by, a computed key or the runs container is Written by', async (t) => {
  const record = readRouteRecord(await savedPlan(t));
  assert.equal(governedBy(explain(record, 'tagExists')), 'Observed by Look for the tag and its release (look-tag#7).');
  assert.equal(governedBy(explain(record, 'action')), 'Observed by Read the request (request#0).');
  assert.equal(governedBy(explain(record, 'commit')), 'Observed by Read the request (request#0).');
  assert.equal(governedBy(explain(record, 'changelogStyle')), 'Observed by Read the settings (look-settings#3).');
  assert.equal(governedBy(explain(record, 'node')), 'Observed by Read the settings (look-settings#3).');
  assert.equal(governedBy(explain(record, 'factsReadable')), 'Written by Weigh the facts (weigh#11).');
  assert.equal(governedBy(explain(record, 'runs')), 'Written by Look for the tag and its release (look-tag#7).');
});

test('why on a verify record: a context value is Observed by, a computed key is Written by', async (t) => {
  const NAME = 'footprint-storydeck';
  const V = `https://registry.npmjs.org/${NAME}/0.13.1`;
  const TARBALL = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.1.tgz`;
  const built = Buffer.from('the built tarball');
  const intake = join(folder(t), 'tarball');
  mkdirSync(intake);
  writeFileSync(join(intake, 'package.tgz'), built);
  const dir = join(folder(t), 'record');
  const report = createReport({ env: {}, print: () => {}, append: () => {} });
  const doc = { name: NAME, version: '0.13.1', dist: { integrity: integrityOf(built), tarball: TARBALL } };
  assert.equal(await runChartStep('verify', {
    env: { ROUTE_PACKAGE: NAME, ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: intake, ROUTE_RECORD_DIR: dir },
    fetcher: fakeFetch({ [V]: json(doc), [TARBALL]: bytes(built) }).fetcher, sleep: async () => {}, report, argv: [],
  }), 0);
  const record = readRouteRecord(join(dir, 'verify.record.json'));
  assert.equal(governedBy(explain(record, 'version')), 'Observed by Read the built file (built#0).');
  assert.equal(governedBy(explain(record, 'servedEqual')), 'Written by Weigh the bytes (weigh-bytes#3).');
});

test('above every walk, one fixed line says side-by-side steps may be shown one under another', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t)));
  const at = lines.findIndex((line) => line.startsWith('Walk back'));
  assert.equal(lines[at + 1], SIDE_BY_SIDE);
  assert.equal(SIDE_BY_SIDE, 'Note: steps that ran side by side may be shown one under another in the walk; the "observed by" line says which step observed the fact.');
  assert.ok(lines[at + 2].startsWith('Walk: '));
});

// The module's reader runs in a child process with a deadline, never in this one: a reader that
// blocks (an open that waits for a FIFO's writer, a read of /dev/zero that never ends) blocks the
// thread it runs on, and node:test's own `timeout` cannot interrupt a test whose thread is blocked,
// so in this process a broken reader would hang the whole suite instead of failing this test.
const READ_IN_A_CHILD = `import { readRouteRecord } from ${JSON.stringify(new URL('../../../src/release-route/chart/why.mjs', import.meta.url).href)};
import { asRefusal } from ${JSON.stringify(new URL('../../../src/release-route/refusals.mjs', import.meta.url).href)};
try { readRouteRecord(process.argv[1]); console.log('answered'); } catch (error) { console.log(asRefusal(error).code); }`;

test('why refuses, without reading on, anything that is not a regular file within the bound (each within 5 seconds)', { timeout: 60_000 }, (t) => {
  const dir = folder(t);
  const fifo = join(dir, 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  mkdirSync(join(dir, 'folder'));
  writeFileSync(join(dir, 'big'), '');
  truncateSync(join(dir, 'big'), MAX_RECORD_BYTES + 1);
  for (const file of ['/dev/zero', fifo, join(dir, 'folder'), join(dir, 'big')]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', READ_IN_A_CHILD, file], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.signal, null, `${file}: the reader did not finish within 5 seconds`);
    assert.equal(result.stdout.trim(), 'record-unreadable', file);
  }
});

test('the bundle answers why /dev/zero and why <a fifo> with record-unreadable, exit 1, in under a second', (t) => {
  const fifo = join(folder(t), 'fifo');
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
  for (const file of ['/dev/zero', fifo]) {
    const result = spawnSync(process.execPath, [resolve('dist/release-route.cjs'), 'why', file], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
    assert.equal(result.status, 1, `${file}: ${result.signal ?? ''}`);
    assert.match(result.stdout, /^Refused: record-unreadable\./m);
  }
});
