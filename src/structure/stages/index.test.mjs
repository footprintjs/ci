import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';
import { stageAnalysis } from './index.mjs';

test('the same callback registered twice keeps provenance but deduplicates each unit rule', () => {
  const body = ['function work(scope) {', ...Array(39).fill('  scope.use();'), '}'].join('\n');
  const parsed = parseSource({ path: 'src/a.ts', text: `import { flowChart } from 'footprintjs'; ${body}
    flowChart('First', work, 'first'); flowChart('Second', work, 'second');` });
  const result = stageAnalysis(parsed, measureParsed(parsed));
  assert.equal(result.findings.filter(item => item.rule === 'stage-lines').length, 1);
  assert.equal(result.stages.length, 2);
  assert.deepEqual(result.unverified, []);
});
