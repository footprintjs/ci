// The table against the code: every stop the code names is in the table, nothing in the table
// is dead, and every code is pinned by a test in test/release-route/. The last check is a proxy
// for "a test goes red without it": the code must appear as a whole word in some test's text.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REFUSALS } from '../../src/release-route/refusals.mjs';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
  item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
const files = walk('src/release-route').filter((path) => /\.(mjs|cjs)$/.test(path));
const sources = files.map((path) => readFileSync(path, 'utf8'));
// Every code quoted anywhere in the code except the table itself (a helper such as build's
// `step(argv, 'install-failed')` passes the code on before it is raised).
const quoted = files.filter((path) => !path.endsWith('refusals.mjs')).map((path) => readFileSync(path, 'utf8')).join('\n');
// Every way the code names a stop: refuse('x'), new Refusal('x'), fail('x') in the archive
// inspector, and `refuse: 'x'` in the rule table.
const USE = /(?:\brefuse|\bRefusal|\bfail)\(\s*'([a-z-]+)'|\brefuse:\s*'([a-z-]+)'/g;
const used = new Set(sources.flatMap((text) => [...text.matchAll(USE)].map((m) => m[1] ?? m[2])));
const codes = Object.keys(REFUSALS);

test('every stop named in the code is in the table', () => {
  for (const code of used) assert.ok(Object.hasOwn(REFUSALS, code), `${code} is used but not in the table`);
});

test('nothing in the table is dead', () => {
  // These two are made by the table itself (an unknown code; an unnamed exception), and
  // invalid-archive is the inspector's bare fail().
  const made = new Set(['unknown-refusal', 'unexpected-failure', 'invalid-archive']);
  for (const code of codes)
    assert.ok(used.has(code) || made.has(code) || quoted.includes(`'${code}'`), `${code} is in the table but nothing raises it`);
});

test('every code is pinned by a test in another file', () => {
  const tests = walk('test/release-route').filter((path) => /\.test\.(mjs|cjs)$/.test(path) && !path.endsWith('refusals-coverage.test.mjs'))
    .map((path) => readFileSync(path, 'utf8')).join('\n');
  for (const code of codes)
    assert.match(tests, new RegExp(`[^a-z-]${code}[^a-z-]`), `${code} is not pinned by any test`);
});

