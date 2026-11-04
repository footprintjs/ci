import assert from 'node:assert/strict';
import test from 'node:test';
import { graphAnalysis } from './index.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { trackedFiles } from '../sources/paths.mjs';

test('a public door report includes its transitive implementation owner', () => {
  const files = trackedFiles({ files: [{ path: 'src/index.ts', text: "export { leaf } from './leaf.js';" },
    { path: 'src/leaf.ts', text: 'export const leaf = 1;' }] });
  const parsed = new Map([...files].map(([path, file]) => [path, parseSource(file)]));
  const result = graphAnalysis(files, parsed, { paths: new Set(['src/index.ts']), seals: [] });
  assert.deepEqual(result.loads[0].eagerSourceFiles, ['src/index.ts', 'src/leaf.ts']);
});
