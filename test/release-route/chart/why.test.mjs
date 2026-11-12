// The `why` reader: from a saved record alone, with no network. Its lines are cleaned; a record
// that is not one is refused; and the committed bundle answers the same as the module.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { explain, readRouteRecord } from '../../../src/release-route/chart/why.mjs';
import { asRefusal } from '../../../src/release-route/refusals.mjs';
import { createReport, safeLine } from '../../../src/release-route/report.mjs';
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

test('why mode: the decision, the rule, each fact with the stage that read it, and the walk back', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t)));
  assert.match(lines[0], /^Why mode = "nothing" in the plan record of run \S+\.$/);
  assert.equal(lines[1], 'Decision at decide#11: rule released matched.');
  assert.deepEqual(lines.slice(2, 5), [
    'Fact tagExists eq true: was true, holds; read by Look for the tag (look-tag#6).',
    'Fact npmHasVersion eq true: was true, holds; read by Ask npm (look-npm#7).',
    'Fact action eq "publish": was "publish", holds; read by Read the request (request#0).',
  ]);
  assert.ok(lines.includes('Walk: . Decide by the rule table (decide#11) ← [control: released]'));
});

test('why on a refusal names the rule and the fact that decided it', async (t) => {
  const lines = explain(readRouteRecord(await savedPlan(t, { lsRemote: '', mainTip: 'f'.repeat(40) })));
  assert.match(lines[0], /^Why refusal = "release-unfinished"/);
  assert.equal(lines[1], 'Decision at decide#11: rule unfinished-not-tip matched.');
  assert.ok(lines.includes('Fact commitIsMainTip eq false: was false, holds; read by Look at the tip of main (look-tip#1).'));
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
