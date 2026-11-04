import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReport } from './index.mjs';

test('JSON preserves complete observations while text keeps advisory status and uncertainty', () => {
  const report = { id: 'head', baseId: 'base', findings: [{ rule: 'nesting' }, { rule: 'nesting' }],
    coverage: { complete: false, unverified: [{ reason: 'unknown alias' }] },
    metadata: { parserVersion: '5.4.5' } };
  assert.deepEqual(JSON.parse(formatReport(report)), report);
  assert.match(formatReport(report, 'text'), /advisory[\s\S]*nesting: 2[\s\S]*Unverified: 1/);
});
