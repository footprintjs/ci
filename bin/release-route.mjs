// The release route's charted steps, as one bundle: node dist/release-route.cjs <plan|verify|why>.
// plan and verify decide inside a footprintjs chart and save their record (ROUTE_RECORD_DIR);
// why <record file> [key] explains a saved record with no network. Built by scripts/build.mjs
// into dist/release-route.cjs, so the workflow runs it with nothing installed. The plain steps
// stay in scripts/release-route.mjs.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { runChartStep } from '../src/release-route/chart/cli.mjs';
import { createReport } from '../src/release-route/report.mjs';
import { stdoutPrinter } from '../src/release-route/stdout.mjs';

const env = process.env;
const source = env.ROUTE_SOURCE || '.';
const git = (args) => execFileSync('git', ['-C', source, ...args], {
  maxBuffer: 8 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, GIT_TERMINAL_PROMPT: '0' },
});
const report = createReport({ env, print: stdoutPrinter({ env }), append: appendFileSync });

// No top-level await: the bundle is CommonJS. runChartStep never rejects; if it did, exit 1.
process.exitCode = 1;
runChartStep(process.argv[2], { env, git, fetcher: globalThis.fetch, sleep: (ms) => wait(ms), report, argv: process.argv.slice(3) })
  .then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
