// docs/RELEASE-ROUTE-CHART.md draws both charts and lists their stages from the real charts
// (toMermaid() and each stage's own id, name and description); this fails when the doc drifts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DRAWINGS, regenerate } from './drawing.mjs';

test('the chart doc holds each generated drawing and stage table exactly', () => {
  const doc = readFileSync('docs/RELEASE-ROUTE-CHART.md', 'utf8');
  for (const [name, body] of Object.entries(DRAWINGS)) assert.ok(doc.includes(`<!-- ${name} -->\n${body}\n<!-- /${name} -->`), `${name} differs from the chart`);
  assert.equal(regenerate(doc), doc);
});
