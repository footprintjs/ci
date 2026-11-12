// The charted steps from a plain checkout: node scripts/release-route-chart.mjs <plan|verify|why>.
// Checks that dist/release-route.cjs is the file its metadata names, then loads it, and the bundle
// runs the step (bin/release-route.mjs). A bundle that is missing, changed or will not load ends
// as the refusal bundle-unloadable and exit 1. Built-in Node modules only.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openBundle } from '../src/release-route/bundle-door.mjs';
import { createReport } from '../src/release-route/report.mjs';
import { printRefusal } from '../src/release-route/step-common.mjs';

const dist = (name) => fileURLToPath(new URL(`../dist/${name}`, import.meta.url));
try {
  openBundle({ bundle: dist('release-route.cjs'), metadata: dist('release-route-metadata.json') });
} catch (error) {
  const print = (line) => process.stdout.write(`${line}\n`);
  process.exitCode = printRefusal(createReport({ env: process.env, print, append: appendFileSync }), error);
}
