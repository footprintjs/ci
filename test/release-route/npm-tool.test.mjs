// The pinned npm: digests checked, unpacked by the inspector's own tar reader into a new private
// folder outside the checkout, and handed to build as the CLI to pack with.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { npmCli, unpackNpm, VENDOR_DIR, vendoredNpm } from '../../src/release-route/npm-tool.mjs';
import { asRefusal } from '../../src/release-route/refusals.mjs';

const folder = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'route-npm-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const code = (fn) => {
  try { fn(); } catch (error) { const r = asRefusal(error); return `${r.code}${r.detail ? ` ${r.detail}` : ''}`; }
  return 'done';
};

test('the vendored npm 11.19.0 unpacks into a new 0700 folder and runs', (t) => {
  const out = join(folder(t), 'npm');
  const result = unpackNpm({ out, source: process.cwd() });
  assert.deepEqual(result, { version: '11.19.0', files: 1943 });
  assert.equal(statSync(out).mode & 0o777, 0o700);
  const run = spawnSync(process.execPath, [npmCli(out), '--version'], { encoding: 'utf8' });
  assert.equal(run.stdout.trim(), '11.19.0');
});

test('a payload that differs from its pinned digest is refused before anything is written', (t) => {
  const vendor = folder(t);
  copyFileSync(join(VENDOR_DIR, 'manifest.json'), join(vendor, 'manifest.json'));
  const bytes = readFileSync(join(VENDOR_DIR, 'npm-11.19.0.tgz'));
  bytes[bytes.length - 20] ^= 1;
  writeFileSync(join(vendor, 'npm-11.19.0.tgz'), bytes);
  const out = join(folder(t), 'npm');
  assert.equal(code(() => unpackNpm({ out, source: process.cwd(), vendorDir: vendor })), 'npm-tool sha256 differs from vendor/npm/manifest.json');
  assert.equal(code(() => statSync(out)), 'unexpected-failure');
  // Only the integrity changed (the sha256 still matches): the sha512 check alone must refuse it.
  writeFileSync(join(vendor, 'npm-11.19.0.tgz'), readFileSync(join(VENDOR_DIR, 'npm-11.19.0.tgz')));
  const pinned = JSON.parse(readFileSync(join(VENDOR_DIR, 'manifest.json'), 'utf8'));
  writeFileSync(join(vendor, 'manifest.json'), JSON.stringify({ ...pinned, integrity: `sha512-${'A'.repeat(86)}==` }));
  assert.equal(code(() => unpackNpm({ out, source: process.cwd(), vendorDir: vendor })), 'npm-tool sha512 differs from vendor/npm/manifest.json');
  assert.equal(code(() => statSync(out)), 'unexpected-failure');
  writeFileSync(join(vendor, 'manifest.json'), '{"name":"npm","name":"npm"}');
  assert.equal(code(() => vendoredNpm(vendor)), 'npm-tool vendor/npm/manifest.json unreadable');
  writeFileSync(join(vendor, 'manifest.json'), JSON.stringify({ name: 'npm', version: '11.19.0', file: '../x.tgz', sha256: 'a'.repeat(64), integrity: `sha512-${'A'.repeat(86)}==` }));
  assert.equal(code(() => vendoredNpm(vendor)), 'npm-tool vendor/npm/manifest.json shape');
});

test('the folder must be absolute, new, with a parent, and outside the checkout', (t) => {
  const base = folder(t);
  mkdirSync(join(base, 'exists'));
  assert.equal(code(() => unpackNpm({ out: 'relative', source: process.cwd() })), 'npm-tool the npm folder is not absolute');
  assert.equal(code(() => unpackNpm({ out: join(base, 'exists'), source: process.cwd() })), 'npm-tool the npm folder exists');
  assert.equal(code(() => unpackNpm({ out: join(base, 'no/parent'), source: process.cwd() })), 'npm-tool the npm folder has no parent');
  assert.equal(code(() => unpackNpm({ out: join(base, 'npm'), source: base })), 'npm-tool the npm folder is inside the checkout');
});

test('npmCli refuses a folder that does not hold the pinned npm', (t) => {
  const dir = folder(t);
  assert.equal(code(() => npmCli(dir)), 'npm-tool the npm folder holds no readable package.json');
  mkdirSync(join(dir, 'package/bin'), { recursive: true });
  writeFileSync(join(dir, 'package/package.json'), JSON.stringify({ name: 'npm', version: '10.9.0' }));
  assert.equal(code(() => npmCli(dir)), 'npm-tool the npm folder holds another npm');
  writeFileSync(join(dir, 'package/package.json'), JSON.stringify({ name: 'npm', version: '11.19.0' }));
  assert.equal(code(() => npmCli(dir)), 'npm-tool the npm folder holds no npm-cli.js');
  assert.equal(code(() => npmCli('relative')), 'npm-tool the npm folder is not absolute');
});
