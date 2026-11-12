// The fixed GitHub host, held two ways, so a change that reads GITHUB_API_URL again goes red for
// that reason and not by chance: no code line of the release tools names the variable (comments
// may, to say it is not read), and a planted value receives no request from either tool.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runHold } from '../../src/hold/run.mjs';
import { observe } from '../../src/release-route/observe.mjs';

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);

test('no code line in src/shared, src/hold, src/release-route or their scripts names GITHUB_API_URL', () => {
  const files = [...walk('src/shared'), ...walk('src/hold'), ...walk('src/release-route'), 'scripts/hold.mjs', 'scripts/release-route.mjs']
    .filter((path) => /\.(mjs|cjs)$/.test(path));
  for (const path of files)
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      if (line.includes('GITHUB_API_URL')) assert.match(line, /^\s*\/\//, `${path}:${index + 1} reads GITHUB_API_URL`);
    });
});

test('a planted GITHUB_API_URL receives nothing: both tools ask api.github.com only', async () => {
  const hosts = [];
  const fetcher = async (url, init) => {
    hosts.push(new URL(url).host);
    return new Response(url.includes('/issues?') ? '[]' : '{}', { status: url.includes('/compare/') ? 404 : 200 });
  };
  const planted = { GITHUB_API_URL: 'https://evil.example/api/v3', GITHUB_TOKEN: 'ghs_secret', GH_TOKEN: 'ghs_secret' };
  await runHold({ env: { HOLD_MODE: 'publish', GITHUB_REPOSITORY: 'footprintjs/example', ...planted }, fetcher, git: () => { throw new Error('no git'); } });
  await observe({ env: { GITHUB_SHA: 'a'.repeat(40), GITHUB_REF: 'refs/heads/main', ROUTE_ACTION: 'publish', ROUTE_TOOL_SHA: 'b'.repeat(40), ...planted },
    git: () => { throw new Error('no git'); }, fetcher });
  assert.ok(hosts.length >= 2, `asked ${hosts.join(', ')}`);
  assert.deepEqual([...new Set(hosts)], ['api.github.com']);
});
