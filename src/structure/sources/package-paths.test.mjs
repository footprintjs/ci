import assert from 'node:assert/strict';
import test from 'node:test';
import { packageSourcePath } from './package-paths.mjs';

const files = (...paths) => new Map(paths.map(path => [path, { path, text: '' }]));

test('direct source targets and direct dist targets preserve one unique source owner', () => {
  const tracked = files('src/entry.ts');
  assert.deepEqual(packageSourcePath('./src/entry.ts', tracked), { path: 'src/entry.ts' });
  assert.deepEqual(packageSourcePath('./dist/entry.js', tracked), { path: 'src/entry.ts' });
});

test('format stripping is top-level and a competing real format folder remains ambiguous', () => {
  const tracked = files('src/entry.ts', 'src/esm/entry.ts');
  assert.match(packageSourcePath('./dist/esm/entry.js', tracked).reason, /ambiguous/i);
  assert.ok(packageSourcePath('./dist/lib/esm/entry.js', files('src/lib/entry.ts')).reason);
});

test('filename resolution does not guess directory indexes, renamed bundles or cjs-to-ts sources', () => {
  const tracked = files('src/core/index.ts', 'src/doors/WhyLens.tsx', 'src/entry.ts');
  assert.ok(packageSourcePath('./dist/core.js', tracked).reason);
  assert.ok(packageSourcePath('./dist/why.js', tracked).reason);
  assert.ok(packageSourcePath('./dist/entry.cjs', tracked).reason);
});

test('path traversal and test/declaration owners cannot establish a public runtime door', () => {
  const tracked = files('src/entry.ts', 'src/entry.d.ts', 'src/entry.test.ts');
  for (const path of ['./dist/../src/entry.ts', './dist/esm/../../src/entry.ts', './dist/entry.d.ts', './dist/entry.test.js']) {
    assert.ok(packageSourcePath(path, tracked).reason, path);
  }
});
