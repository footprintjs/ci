import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverDoors } from './doors.mjs';
import { trackedFiles } from './paths.mjs';

function doors(exports, sources) {
  return discoverDoors(trackedFiles({ files: [
    { path: 'package.json', text: JSON.stringify({ exports }) },
    ...sources.map(path => ({ path, text: '' })),
  ] }));
}

// Runtime/type target excerpts from the exact three repository manifests in the
// independently measured snapshots; no build configuration or candidate code runs.
const actualLayouts = [
  { name: 'agentfootprint providers', door: './providers', source: 'src/doors/providers.ts', stem: 'doors/providers' },
  { name: 'footPrint advanced', door: './advanced', source: 'src/advanced.ts', stem: 'advanced' },
  { name: 'foottrace cause', door: './cause', source: 'src/cause.ts', stem: 'cause' },
];

for (const layout of actualLayouts) {
  test(`${layout.name} maps its ESM and direct runtime targets to one source door`, () => {
    const result = doors({ [layout.door]: {
      import: { types: `./dist/esm/${layout.stem}.d.ts`, default: `./dist/esm/${layout.stem}.js` },
      require: { types: `./dist/types/${layout.stem}.d.ts`, default: `./dist/${layout.stem}.js` },
    } }, [layout.source]);
    assert.ok(result.paths.has(layout.source), 'missing tracked public source owner');
    assert.deepEqual(result.unverified, []);
  });
}

test('top-level esm and cjs format directories are finite alternate mappings', () => {
  const result = doors({ './entry': { import: './dist/esm/entry.js', require: './dist/cjs/entry.js' } }, ['src/entry.ts']);
  assert.ok(result.paths.has('src/entry.ts'), 'missing unique format-directory owner');
  assert.deepEqual(result.unverified, []);
});

test('direct and format-stripped source candidates are ambiguous rather than first-match wins', () => {
  const result = doors({ './entry': './dist/esm/entry.js' }, ['src/esm/entry.ts', 'src/entry.ts']);
  assert.equal(result.unverified.length, 1, 'both tracked mappings must stay unverified');
  assert.match(result.unverified[0].reason, /ambiguous/i);
  assert.equal(result.paths.has('src/esm/entry.ts'), false);
  assert.equal(result.paths.has('src/entry.ts'), false);
});

test('extension ambiguity in a direct candidate is not hidden by one stripped candidate', () => {
  const result = doors({ './entry': './dist/esm/entry.js' }, ['src/esm/entry.js', 'src/esm/entry.ts', 'src/entry.ts']);
  assert.equal(result.unverified.length, 1);
  assert.match(result.unverified[0].reason, /ambiguous/i);
  assert.equal(result.paths.has('src/entry.ts'), false);
});

test('a real source format directory remains a valid unique direct mapping', () => {
  const result = doors({ './entry': './dist/esm/entry.js' }, ['src/esm/entry.ts']);
  assert.ok(result.paths.has('src/esm/entry.ts'));
  assert.deepEqual(result.unverified, []);
});

test('mjs and cjs preserve their existing mts and cts source-extension laws', () => {
  const result = doors({ './one': './dist/esm/one.mjs', './two': './dist/cjs/two.cjs' }, ['src/one.mts', 'src/two.cts']);
  assert.ok(result.paths.has('src/one.mts'));
  assert.ok(result.paths.has('src/two.cts'));
  assert.deepEqual(result.unverified, []);
});

test('Lens bundled subpaths stay unknown rather than guessing folder indexes or doors', () => {
  const result = doors({ './core': { import: { default: './dist/core.js' }, require: { default: './dist/core.cjs' } } },
    ['src/core/index.ts', 'src/doors/WhyLens.tsx']);
  assert.equal(result.unverified.length, 2);
  assert.equal(result.paths.has('src/doors/WhyLens.tsx'), false);
  assert.ok(result.unverified.every(item => item.kind === 'package-door'));
});
