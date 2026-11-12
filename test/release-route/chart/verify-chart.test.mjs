// The charted verify against the plain one, and what its record explains: which bytes, which
// digest, how many looks.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { explain, readRouteRecord } from '../../../src/release-route/chart/why.mjs';
import { runStep } from '../../../src/release-route/command.mjs';
import { integrityOf } from '../../../src/release-route/registry.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { bytes, fakeFetch, json } from '../fake-fetch.mjs';

const NAME = 'footprint-storydeck';
const V = `https://registry.npmjs.org/${NAME}/0.13.1`;
const TARBALL = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.1.tgz`;
const built = Buffer.from('the built tarball');
const doc = (integrity) => ({ name: NAME, version: '0.13.1', dist: { integrity, tarball: TARBALL } });
const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-verify-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
async function verify(t, runner, routes, recordDir) {
  const intake = join(folder(t), 'tarball');
  mkdirSync(intake);
  writeFileSync(join(intake, 'package.tgz'), built);
  const printed = [];
  const report = createReport({ env: {}, print: (line) => printed.push(line), append: () => {} });
  const env = { ROUTE_PACKAGE: NAME, ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: intake, ...(recordDir ? { ROUTE_RECORD_DIR: recordDir } : {}) };
  const code = await runner('verify', { env, fetcher: fakeFetch(routes).fetcher, sleep: async () => {}, report, argv: [] });
  return { code, printed };
}

let looks = 0;
for (const [label, routes, expected] of [
  ['npm serves the built bytes', { [V]: json(doc(integrityOf(built))), [TARBALL]: bytes(built) }, /^Verified: npm serves/],
  ['npm records another integrity', { [V]: json(doc(integrityOf(Buffer.from('other')))) }, /^Refused: registry-differs/],
  ['npm serves other bytes', { [V]: json(doc(integrityOf(built))), [TARBALL]: bytes(Buffer.from('other')) }, /^Refused: registry-differs/],
  ['npm never shows the version', { [V]: json({}, 404) }, /^Refused: registry-late/],
  ['npm shows it on the third look', { [V]: () => (++looks < 3 ? json({}, 404)() : json(doc(integrityOf(built)))()), [TARBALL]: bytes(built) }, /^Verified/],
])
  test(`verify, plain and charted, agree: ${label}`, async (t) => {
    looks = 0;
    const plain = await verify(t, runStep, routes);
    looks = 0;
    const dir = join(folder(t), 'record');
    const chart = await verify(t, runChartStep, routes, dir);
    assert.equal(chart.code, plain.code);
    const decisive = (lines) => lines.filter((line) => /^(Verified|Refused|Detail)/.test(line));
    assert.deepEqual(decisive(chart.printed), decisive(plain.printed));
    assert.match(decisive(chart.printed)[0], expected);
    const record = readRouteRecord(join(dir, 'verify.record.json'));
    assert.equal(record.state.localIntegrity, integrityOf(built));
    assert.ok(record.state.looks >= 1);
  });

test('the record explains registry-differs: which digest, and the rule that decided', async (t) => {
  const dir = join(folder(t), 'record');
  await verify(t, runChartStep, { [V]: json(doc(integrityOf(Buffer.from('other')))) }, dir);
  const lines = explain(readRouteRecord(join(dir, 'verify.record.json')));
  assert.equal(lines[0].replace(/run \S+\./, 'run X.'), 'Why refusal = "registry-differs" in the verify record of run X.');
  assert.ok(lines.includes('Decision at compare#4: rule npm records another integrity matched.'), lines.join('\n'));
  assert.ok(lines.some((line) => /^Fact integrityEqual eq false: was false, holds; read by Weigh the bytes/.test(line)));
});

test('the record explains registry-late: how many looks', async (t) => {
  const dir = join(folder(t), 'record');
  const result = await verify(t, runChartStep, { [V]: json({}, 404) }, dir);
  assert.equal(result.code, 1);
  const record = readRouteRecord(join(dir, 'verify.record.json'));
  assert.deepEqual([record.state.looks, record.failure.code], [20, 'registry-late']);
  assert.ok(explain(record, 'looks').some((line) => line.startsWith("Walk: Ask npm for the version's record")));
});
