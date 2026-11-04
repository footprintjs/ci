import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceAnalysis } from './analyze.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { codePath, trackedFiles } from '../sources/paths.mjs';

test('a surviving forwarding facade cannot satisfy the old implementation-owner citation', () => {
  const files = trackedFiles({ files: Object.entries({
    'src/owner.ts': "export { work } from './owner/work.js';", 'src/owner/work.ts': 'export function work() {}',
    'docs/current.md': 'See `src/owner.ts` · `work`.',
  }).map(([path, text]) => ({ path, text })) });
  const parsed = new Map([...files].filter(([path]) => codePath(path)).map(([path, file]) => [path, parseSource(file)]));
  assert.ok(referenceAnalysis(files, parsed).findings.some(item => item.rule === 'citation-owner'));
});
