// A stdout the reader closed (`why <record> | head -8`) ends a step quietly with exit 1: no stack
// with the runner's paths on stderr (src/release-route/stdout.mjs). Each entry point runs in a
// child process whose stdout is closed before it prints. Before the fix, the bundle ended with
// "Error: write EPIPE … at print (…/dist/release-route.cjs…)" on stderr (second read, round 2, R2-N5).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { runChartStep } from '../../../src/release-route/chart/cli.mjs';
import { createReport } from '../../../src/release-route/report.mjs';
import { storydeckDoors } from '../storydeck-today.mjs';

function withClosedStdout(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
    child.stdout.destroy();
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => done({ code, signal, stderr }));
  });
}

test('a closed stdout: every entry point exits 1 and prints nothing to stderr', { timeout: 30_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-closed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const report = createReport({ env: {}, print: () => {}, append: () => {} });
  await runChartStep('plan', { ...storydeckDoors({ extra: { ROUTE_RECORD_DIR: dir } }), report, argv: [] });
  const record = join(dir, 'plan.record.json');
  for (const args of [[resolve('dist/release-route.cjs'), 'why', record], [resolve('scripts/release-route-chart.mjs'), 'why', record],
    [resolve('scripts/release-route.mjs'), 'ship']]) {
    const result = await withClosedStdout(args);
    assert.deepEqual([result.code, result.signal, result.stderr], [1, null, ''], args.join(' '));
  }
});
