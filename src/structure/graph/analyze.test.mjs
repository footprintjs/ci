import assert from 'node:assert/strict';
import test from 'node:test';
import { graphAnalysis } from './analyze.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { trackedFiles } from '../sources/paths.mjs';

test('the direct-module ceiling includes unique external module specifiers', () => {
  const text = Array.from({ length: 21 }, (_, index) => `import 'package-${index}';`).join('\n');
  const dependencies = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`package-${index}`, '1.0.0']));
  const files = trackedFiles({ files: [{ path: 'src/use.ts', text },
    { path: 'package.json', text: JSON.stringify({ dependencies }) }] });
  const parsed = new Map([['src/use.ts', parseSource(files.get('src/use.ts'))]]);
  const result = graphAnalysis(files, parsed, { paths: new Set(), seals: [] });
  assert.ok(result.findings.some(item => item.rule === 'direct-imports' && item.value === 21));
});
