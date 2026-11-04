import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRelative, trackedFiles, productionPath, measurementPath } from './paths.mjs';

test('runtime source resolution follows tracked js spelling without escaping or guessing ambiguity', () => {
  const files = trackedFiles({ files: [{ path: 'src/leaf.ts', text: '' }] });
  assert.equal(resolveRelative('src/index.ts', './leaf.js', files).path, 'src/leaf.ts');
  assert.ok(resolveRelative('src/index.ts', '../../outside.js', files).reason);
  files.set('src/leaf.js', { path: 'src/leaf.js', text: '' });
  assert.ok(resolveRelative('src/index.ts', './leaf.js', files).reason);
  assert.equal(productionPath('src/leaf.test.ts'), false);
  assert.equal(productionPath('src/leaf.d.ts'), false);
  assert.equal(measurementPath('src/leaf.d.ts'), true);
});

test('duplicate tracked paths cannot silently replace source observations', () => {
  assert.throws(() => trackedFiles({ files: [{ path: 'src/a.ts', text: '' }, { path: 'src/a.ts', text: 'changed' }] }), TypeError);
});
