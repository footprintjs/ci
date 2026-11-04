import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceAnalysis } from './index.mjs';
import { trackedFiles } from '../sources/paths.mjs';

test('historical missing paths remain visible without becoming current findings', () => {
  const files = trackedFiles({ files: [{ path: 'CHANGELOG.md', text: 'Earlier `src/removed.ts`.' }] });
  const result = referenceAnalysis(files, new Map());
  assert.deepEqual(result.findings, []);
  assert.equal(result.historicalReferences[0].target, 'src/removed.ts');
});
