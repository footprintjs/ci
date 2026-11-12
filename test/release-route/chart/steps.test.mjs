// The charted steps (their comparison with the plain ones is same-as-plain-*.test.mjs): the record saved, holding no secret; and every way saving can fail, which never turns a
// decision around.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { MAX_RECORD_BYTES, saveRecord } from '../../../src/release-route/chart/record.mjs';
import { readRouteRecord } from '../../../src/release-route/chart/why.mjs';
import { asRefusal } from '../../../src/release-route/refusals.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { COMMIT, FILES, storydeckDoors } from '../storydeck-today.mjs';

const TOKEN = 'ghs_RecognisableToken0123456789';
const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-chart-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
async function step(runner, name, options = {}, extraEnv = {}) {
  const doors = storydeckDoors({ ...options, extra: { GITHUB_TOKEN: TOKEN, ...(options.extra ?? {}), ...extraEnv } });
  const written = {};
  const printed = [];
  const report = createReport({ env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, print: (line) => printed.push(line),
    append: (path, text) => { written[path] = (written[path] ?? '') + text; } });
  const code = await runner(name, { ...doors, report, sleep: async () => {}, argv: [] });
  return { code, output: written.out ?? '', printed, calls: doors.calls };
}

test('the charted plan prints the story of its decision in the library\'s words', async () => {
  const chart = await step(runChartStep, 'plan');
  assert.ok(chart.printed.some((line) => /^Story: \[Condition\]: It evaluated Rule \d+ "released": tagExists true eq true/.test(line)), chart.printed.join('\n'));
});

test('the record is saved, readable, and holds neither the token nor a path of this machine', async (t) => {
  const dir = join(folder(t), 'record');
  const chart = await step(runChartStep, 'plan', {}, { ROUTE_RECORD_DIR: dir });
  assert.equal(chart.code, 0);
  assert.ok(chart.printed.includes('Record: plan.record.json saved in ROUTE_RECORD_DIR.'));
  const text = readFileSync(join(dir, 'plan.record.json'), 'utf8');
  assert.ok(!text.includes(TOKEN), 'the token is in the record');
  assert.ok(!text.includes('GITHUB_TOKEN') && !text.includes(tmpdir()) && !text.includes(homedir()) && !text.includes(process.cwd()) && !text.includes(dir), 'an environment name or a path is in the record');
  const record = readRouteRecord(join(dir, 'plan.record.json'));
  assert.deepEqual([record.step, record.state.rule, record.state.mode, record.library.footprintjs], ['plan', 'released', 'nothing', JSON.parse(readFileSync('package.json', 'utf8')).dependencies.footprintjs]);
  assert.ok(chart.calls.some((call) => call.headers.authorization === `Bearer ${TOKEN}`), 'the token did reach GitHub, through its door');
});

test('no ROUTE_RECORD_DIR: nothing is saved and the step still decides', async () => {
  const chart = await step(runChartStep, 'plan');
  assert.equal(chart.code, 0);
  assert.ok(!chart.printed.some((line) => line.startsWith('Record:')));
});

test('a record that cannot be written: a pass becomes record-unwritten (exit 1) after the decision is printed', async (t) => {
  const base = folder(t);
  writeFileSync(join(base, 'a-file'), 'x');
  for (const [dir, detail] of [[join(base, 'a-file'), 'ROUTE_RECORD_DIR is not a folder'], ['relative/dir', 'ROUTE_RECORD_DIR is not absolute']]) {
    const chart = await step(runChartStep, 'plan', {}, { ROUTE_RECORD_DIR: dir });
    assert.equal(chart.code, 1);
    assert.ok(chart.printed.some((line) => line.startsWith('Decision: rule released gives mode nothing')), 'the decision is printed first');
    assert.deepEqual(chart.printed.slice(-2), ['Refused: record-unwritten. The run\'s record could not be written to ROUTE_RECORD_DIR; a release with no record is not what this route promises.', `Detail: ${detail}`]);
    assert.doesNotMatch(chart.output, /^(mode|compare)=/m, 'a step that exits 1 told a later job to act');
    assert.match(chart.output, /^rule=released$/m);
  }
  const dir = join(base, 'once');
  assert.equal((await step(runChartStep, 'plan', {}, { ROUTE_RECORD_DIR: dir })).code, 0);
  const again = await step(runChartStep, 'plan', {}, { ROUTE_RECORD_DIR: dir });
  assert.deepEqual([again.code, again.printed.at(-1)], [1, 'Detail: plan.record.json is already there']);
});

test('a refusal whose record cannot be written stays that refusal, and says the record was not saved', async (t) => {
  const base = folder(t);
  writeFileSync(join(base, 'a-file'), 'x');
  const chart = await step(runChartStep, 'plan', { lsRemote: '', mainTip: 'f'.repeat(40) }, { ROUTE_RECORD_DIR: join(base, 'a-file') });
  assert.equal(chart.code, 1);
  assert.ok(chart.printed.includes('Record: not saved (record-unwritten); the decision below stands.'));
  assert.match(chart.printed.at(-2), /^Refused: release-unfinished\./);
});

test('a refusal is saved too: the record of a refused plan is complete', async (t) => {
  const dir = join(folder(t), 'r');
  const chart = await step(runChartStep, 'plan', { lsRemote: '', mainTip: 'f'.repeat(40) }, { ROUTE_RECORD_DIR: dir });
  assert.equal(chart.code, 1);
  const record = readRouteRecord(join(dir, 'plan.record.json'));
  assert.deepEqual([record.state.rule, record.state.refusal, record.failure], ['unfinished-not-tip', 'release-unfinished', null]);
  const failed = await step(runChartStep, 'plan', { extra: { GITHUB_SHA: 'main' } }, { ROUTE_RECORD_DIR: join(dir, 'x') });
  assert.equal(failed.code, 1);
  assert.deepEqual(readRouteRecord(join(dir, 'x', 'plan.record.json')).failure, { code: 'input-invalid', detail: 'GITHUB_SHA' });
});

test('a publish whose record cannot be written exits 1 and leaves no mode and no compare in GITHUB_OUTPUT', async (t) => {
  const base = folder(t);
  writeFileSync(join(base, 'a-file'), 'x');
  const files = { ...FILES,
    'package.json': Buffer.from(FILES['package.json'].toString().replace('"version": "0.13.1"', '"version": "0.13.2"')),
    'CHANGELOG.md': Buffer.from(FILES['CHANGELOG.md'].toString().replace('# Changelog\n', '# Changelog\n\n## 0.13.2 \u{2014} t\n\n- x\n')) };
  const chart = await step(runChartStep, 'plan', { files, lsRemote: '' }, { ROUTE_RECORD_DIR: join(base, 'a-file') });
  assert.equal(chart.code, 1);
  assert.ok(chart.printed.some((line) => line.startsWith('Decision: rule publish gives mode publish')), 'the decision is still printed');
  assert.equal(chart.output, `rule=publish\ncommit=${COMMIT}\npackage=footprint-storydeck\nversion=0.13.2\n`);
});

test('a ROUTE_RECORD_DIR that is a link (even to a real folder) is refused, and nothing is written through it', async (t) => {
  const base = folder(t);
  mkdirSync(join(base, 'real'));
  symlinkSync(join(base, 'real'), join(base, 'link'));
  const chart = await step(runChartStep, 'plan', {}, { ROUTE_RECORD_DIR: join(base, 'link') });
  assert.equal(chart.code, 1);
  assert.deepEqual(chart.printed.slice(-1), ['Detail: ROUTE_RECORD_DIR is not a folder']);
  assert.equal(existsSync(join(base, 'real', 'plan.record.json')), false);
});

test('a record over its bound is not written: record-unwritten, and no file is left', (t) => {
  const dir = join(folder(t), 'r');
  let refusal = null;
  try {
    saveRecord({ ROUTE_RECORD_DIR: dir }, 'plan', { big: 'x'.repeat(MAX_RECORD_BYTES) });
  } catch (error) {
    refusal = asRefusal(error);
  }
  assert.deepEqual([refusal?.code, refusal?.detail], ['record-unwritten', 'the record is over its bound']);
  assert.equal(existsSync(join(dir, 'plan.record.json')), false);
});
