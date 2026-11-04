import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';
import { stageFindings } from './measure.mjs';

test('stage limits remain fixed and missing decider evidence is separately reported', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'function work() {}' });
  const source = measureParsed(parsed);
  const node = parsed.sourceFile.statements[0];
  const unit = source.functions[0];
  assert.ok(unit, 'missing measured stage fixture');
  const result = stageFindings({ source, unit: { ...unit, codeLines: 41, complexity: 9 }, node, spec: { choice: 'either' } });
  assert.deepEqual(result.findings.map(item => item.rule), ['stage-lines', 'stage-complexity', 'decider-choice']);
  assert.deepEqual(result.findings.map(item => item.limit), [40, 8, 0]);
});
