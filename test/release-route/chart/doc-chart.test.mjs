// docs/RELEASE-ROUTE-CHART.md draws both charts and lists their stages from the real charts
// (toMermaid() and each stage's own id, name and description); this fails when the doc drifts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIDE_BY_SIDE } from '../../../src/release-route/chart/why.mjs';
import { DRAWINGS, regenerate } from './drawing.mjs';

test('the chart doc holds each generated drawing and stage table exactly', () => {
  const doc = readFileSync('docs/RELEASE-ROUTE-CHART.md', 'utf8');
  for (const [name, body] of Object.entries(DRAWINGS)) assert.ok(doc.includes(`<!-- ${name} -->\n${body}\n<!-- /${name} -->`), `${name} differs from the chart`);
  assert.equal(regenerate(doc), doc);
});

test('the chart doc says what the record cannot show yet, in the words why prints', () => {
  const doc = readFileSync('docs/RELEASE-ROUTE-CHART.md', 'utf8');
  const section = doc.slice(doc.indexOf('## What the record cannot show yet'));
  assert.ok(doc.includes('## What the record cannot show yet'));
  const sentence = SIDE_BY_SIDE.replace(/^Note: steps/, 'Steps');
  assert.ok(section.replace(/\n/g, ' ').includes(sentence), 'the sentence differs from why.mjs · SIDE_BY_SIDE');
  assert.match(section, /footprintjs 12\.1\.0 with foottrace 1\.15\.0/);
});
