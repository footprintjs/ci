// Whatever a stage throws leaves it as a refusal holding only its code and its shown detail
// (chart/stage.mjs · stageFn), so a secret in a thrown message reaches neither the saved record
// (the engine's execution tree and story included) nor the printed lines nor the summary. Each
// stage of both charts is made to throw in turn, synchronously and asynchronously.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PLAN_STAGES } from '../../../src/release-route/chart/plan-chart.mjs';
import { VERIFY_STAGES } from '../../../src/release-route/chart/verify-chart.mjs';
import { integrityOf } from '../../../src/release-route/registry.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { storydeckDoors } from '../storydeck-today.mjs';
import { runWithStages } from './stand-in.mjs';

const SECRET = 'ghs_PlantedSecret0123456789abcdef';
const throwing = (stage, async) => ({ ...stage, make: () => (async ? async () => { throw new Error(`token ${SECRET}`); } : () => { throw new Error(`token ${SECRET}`); }) });

// Every way to make one stage (or, for the result branches, every branch) throw.
function standIns(stages, async) {
  const out = [];
  for (const [key, value] of Object.entries(stages)) {
    if (!Array.isArray(value)) out.push([key, { ...stages, [key]: throwing(value, async) }]);
    else if (['results', 'outcomes'].includes(key)) out.push([key, { ...stages, [key]: value.map((stage) => throwing(stage, async)) }]);
    else value.forEach((stage, i) => out.push([`${key}[${stage.id}]`, { ...stages, [key]: value.map((one, j) => (j === i ? throwing(one, async) : one)) }]));
  }
  return out;
}

async function runWith(t, step, stages, doors) {
  const dir = mkdtempSync(join(tmpdir(), 'route-throw-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const written = {};
  const printed = [];
  const report = createReport({ env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'summary' }, print: (line) => printed.push(line),
    append: (path, text) => { written[path] = (written[path] ?? '') + text; } });
  const env = { ...doors.env, ROUTE_RECORD_DIR: join(dir, 'record') };
  const code = await runWithStages(step, stages, { ...doors, env, report, sleep: async () => {}, argv: [] });
  return { code, printed, written, record: readFileSync(join(dir, 'record', `${step}.record.json`), 'utf8'), dir };
}

for (const async of [false, true])
  for (const [label, stages] of standIns(PLAN_STAGES, async))
    test(`plan: a ${async ? 'rejecting' : 'throwing'} ${label} leaves no trace of its message`, async (t) => {
      const result = await runWith(t, 'plan', stages, storydeckDoors());
      assert.equal(result.code, 1);
      assert.ok(result.printed.some((line) => line.startsWith('Refused: unexpected-failure.')), result.printed.join('\n'));
      for (const [where, text] of [['record', result.record], ['printed', result.printed.join('\n')], ['summary', result.written.summary ?? ''], ['output', result.written.out ?? '']])
        assert.ok(!text.includes(SECRET) && !text.includes('token '), `${where} holds the thrown message`);
    });

const NAME = 'footprint-storydeck';
const built = Buffer.from('the built tarball');
const V = `https://registry.npmjs.org/${NAME}/0.13.1`;
const T = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.1.tgz`;
const routes = {
  [V]: () => new Response(JSON.stringify({ name: NAME, version: '0.13.1', dist: { integrity: integrityOf(built), tarball: T } })),
  [T]: () => new Response(built),
};

for (const async of [false, true])
  for (const [label, stages] of standIns(VERIFY_STAGES, async))
    test(`verify: a ${async ? 'rejecting' : 'throwing'} ${label} leaves no trace of its message`, async (t) => {
      const intake = mkdtempSync(join(tmpdir(), 'route-throw-intake-'));
      t.after(() => rmSync(intake, { recursive: true, force: true }));
      mkdirSync(join(intake, 'tarball'));
      writeFileSync(join(intake, 'tarball', 'package.tgz'), built);
      const fetcher = async (url) => routes[url]();
      const result = await runWith(t, 'verify', stages, { env: { ROUTE_PACKAGE: NAME, ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: join(intake, 'tarball') }, fetcher });
      assert.equal(result.code, 1);
      assert.ok(result.printed.some((line) => line.startsWith('Refused: unexpected-failure.')), result.printed.join('\n'));
      for (const text of [result.record, result.printed.join('\n'), result.written.summary ?? ''])
        assert.ok(!text.includes(SECRET) && !text.includes('token '), 'the thrown message is kept');
    });
