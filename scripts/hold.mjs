import { execFileSync } from 'node:child_process';
import { runHold } from '../src/hold/run.mjs';

// Environment in. The workflow sets HOLD_MODE, GH_TOKEN, BASE_SHA (pull-request mode) and
// HOLD_SOURCE_DIR (the caller's checkout, default ".") from `env:`, never from a script
// string; the runner itself provides GITHUB_REPOSITORY (the CALLER's repository, also
// inside a reusable workflow) and GITHUB_API_URL.
const dir = process.env.HOLD_SOURCE_DIR || '.';
const git = (args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
let result = { code: 1, lines: ['Hold check FAILED: could not check for a hold (the command itself failed to start).'] };
try {
  result = await runHold({ env: process.env, fetcher: globalThis.fetch, git });
} catch {
  // runHold never throws; if it did, the default above already says "failed".
}
for (const line of result.lines) console.log(line);
process.exitCode = result.code;
