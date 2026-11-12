// The charted verify against the plain one on the second reader's nine answers from npm: the
// same exit code, printed lines, GITHUB_OUTPUT and summary (Story: and Record: set apart).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { integrityOf } from '../../../src/release-route/registry.mjs';
import { runBoth } from './same-steps.mjs';

const NAME = 'footprint-storydeck';
const V = `https://registry.npmjs.org/${NAME}/0.13.1`;
const T = `https://registry.npmjs.org/${NAME}/-/${NAME}-0.13.1.tgz`;
const built = Buffer.from('the built tarball');
const doc = (dist = {}) => JSON.stringify({ name: NAME, version: '0.13.1', dist: { integrity: integrityOf(built), tarball: T, ...dist } });
const answer = (body, status = 200, headers) => () => new Response(body, { status, headers });

const CASES = {
  'npm serves the built bytes': { [V]: answer(doc()), [T]: answer(built) },
  'npm records another integrity': { [V]: answer(doc({ integrity: integrityOf(Buffer.from('x')) })), [T]: answer(built) },
  'npm serves other bytes': { [V]: answer(doc()), [T]: answer(Buffer.from('other')) },
  'no integrity': { [V]: answer(JSON.stringify({ name: NAME, version: '0.13.1', dist: { tarball: T } })) },
  'a tarball on another host': { [V]: answer(doc({ tarball: 'https://elsewhere.example/x.tgz' })) },
  'never shown (404 at every look)': { [V]: answer('{}', 404) },
  'npm 500': { [V]: answer('x', 500) },
  'the tarball redirects': { [V]: answer(doc()), [T]: answer(null, 302, { location: 'https://x/' }) },
  'the document is not JSON': { [V]: answer('nope') },
};

for (const [label, routes] of Object.entries(CASES))
  test(`verify, plain and charted, leave the same lines, outputs, summary and exit code: ${label}`, async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'route-same-verify-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, 'tarball'));
    writeFileSync(join(dir, 'tarball', 'package.tgz'), built);
    const fetcher = async (url) => { if (!Object.hasOwn(routes, url)) throw new TypeError('fetch failed'); return routes[url](); };
    const doors = () => ({ env: { ROUTE_PACKAGE: NAME, ROUTE_VERSION: '0.13.1', ROUTE_TARBALL_DIR: join(dir, 'tarball') }, fetcher, wait: { tries: 2, delayMs: 0 } });
    const { plain, chart } = await runBoth('verify', doors);
    assert.deepEqual(chart, { ...plain, chartOnly: chart.chartOnly });
  });
