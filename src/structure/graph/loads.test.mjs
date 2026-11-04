import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoads } from './loads.mjs';

test('cycles terminate and lazy source modules extend only the potential set', () => {
  const edges = [{ from: 'src/index.ts', to: 'src/eager.ts', eager: true },
    { from: 'src/eager.ts', to: 'src/index.ts', eager: true },
    { from: 'src/eager.ts', to: 'src/lazy.ts', eager: false }];
  const [result] = sourceLoads(new Set(['src/index.ts']), edges);
  assert.deepEqual(result.eagerSourceFiles, ['src/eager.ts', 'src/index.ts']);
  assert.deepEqual(result.potentialSourceFiles, ['src/eager.ts', 'src/index.ts', 'src/lazy.ts']);
});
