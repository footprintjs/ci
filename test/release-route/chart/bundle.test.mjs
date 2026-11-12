// The charted steps run from the committed bundle through a plain loader: the bundle must be the
// file its metadata names and must load, or the step is bundle-unloadable (exit 1). And the plain
// path never needs an install: only chart/ imports a package, and nothing outside chart/ imports it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { openBundle } from '../../../src/release-route/bundle-door.mjs';
import { asRefusal } from '../../../src/release-route/refusals.mjs';

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const refusal = (fn) => { try { fn(); } catch (error) { return asRefusal(error); } return null; };
const sha = (text) => createHash('sha256').update(text).digest('hex');

test('a bundle that is missing, not the file its metadata names, or throws while loading is bundle-unloadable', (t) => {
  const dir = folder(t);
  const bundle = join(dir, 'b.cjs');
  const metadata = join(dir, 'm.json');
  const load = (path) => { if (readFileSync(path, 'utf8').includes('throw')) throw new Error('boom'); };
  assert.equal(refusal(() => openBundle({ bundle, metadata, load })).detail, 'the bundle or its metadata could not be read');
  writeFileSync(bundle, 'module.exports = 1;');
  writeFileSync(metadata, JSON.stringify({ sha256: sha('module.exports = 2;') }));
  assert.equal(refusal(() => openBundle({ bundle, metadata, load })).detail, 'the bundle is not the file its metadata names');
  writeFileSync(metadata, JSON.stringify({ sha256: 'x' }));
  assert.equal(refusal(() => openBundle({ bundle, metadata, load })).code, 'bundle-unloadable');
  writeFileSync(bundle, 'throw 1;');
  writeFileSync(metadata, JSON.stringify({ sha256: sha('throw 1;') }));
  assert.equal(refusal(() => openBundle({ bundle, metadata, load })).detail, 'the bundle threw while loading');
  writeFileSync(bundle, 'module.exports = 1;');
  writeFileSync(metadata, JSON.stringify({ sha256: sha('module.exports = 1;') }));
  const loaded = [];
  assert.equal(refusal(() => openBundle({ bundle, metadata, load: (path) => loaded.push(path) })), null);
  assert.deepEqual(loaded, [bundle]);
});

test('the plain loader runs the committed bundle: an unknown step is refused by the bundle itself, exit 1', () => {
  const result = spawnSync(process.execPath, ['scripts/release-route-chart.mjs', 'ship'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^Refused: unknown-step\./m);
  const why = spawnSync(process.execPath, ['scripts/release-route-chart.mjs', 'why'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(why.status, 1);
  assert.match(why.stdout, /^Refused: input-invalid\./m);
});

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]);
const imports = (path) => [...readFileSync(path, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1] ?? m[2]);

test('only chart/ imports a package; nothing outside chart/ imports chart/', () => {
  const files = walk('src/release-route').filter((path) => /\.(mjs|cjs)$/.test(path));
  for (const path of files) {
    const charted = path.startsWith(join('src', 'release-route', 'chart'));
    for (const target of imports(path)) {
      const local = target.startsWith('node:') || target.startsWith('.');
      if (!charted) assert.ok(local && !/(^|\/)chart\//.test(target), `${path} imports ${target}`);
      else assert.ok(local || /^(footprintjs|foottrace)(\/[a-z]+)?(\/package\.json)?$/.test(target), `${path} imports ${target}`);
    }
  }
  for (const path of ['scripts/release-route.mjs', 'scripts/release-route-chart.mjs'])
    for (const target of imports(path)) assert.ok(target.startsWith('node:') || (target.startsWith('../src/release-route/') && !target.includes('/chart/')), `${path} imports ${target}`);
});
