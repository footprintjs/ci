// The release route's one command: node scripts/release-route.mjs <plan|build|inspect|verify|notes>
// Built-in Node modules only: the workflow runs this from a plain checkout with no install.
// What each step reads and writes: src/release-route/command.mjs and docs/RELEASE-ROUTE.md.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { runStep } from '../src/release-route/command.mjs';
import { createReport } from '../src/release-route/report.mjs';

const env = process.env;
const source = env.ROUTE_SOURCE || '.';
// The git door: fixed arguments from the route's modules, never a shell; no prompt for a password.
const git = (args) => execFileSync('git', ['-C', source, ...args], {
  maxBuffer: 8 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...env, GIT_TERMINAL_PROMPT: '0' },
});
// Belt and braces: no message carries a token, and if one ever did, it is masked here.
const secret = typeof env.GITHUB_TOKEN === 'string' && env.GITHUB_TOKEN.length >= 8 ? env.GITHUB_TOKEN : null;
const print = (line) => process.stdout.write(`${secret ? line.split(secret).join('***') : line}\n`);
const report = createReport({ env, print, append: appendFileSync });

let code = 1;
try {
  code = await runStep(process.argv[2], { env, git, fetcher: globalThis.fetch, sleep: (ms) => wait(ms), report });
} catch {
  // runStep never throws; if it did, the exit code below is still 1.
}
process.exitCode = code;
