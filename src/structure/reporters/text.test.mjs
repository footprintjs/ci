import assert from 'node:assert/strict';
import test from 'node:test';
import { summaryText } from './text.mjs';
import { formatReport } from './format.mjs';

function compared() {
  const findings = Array.from({ length: 109 }, () => ({ rule: 'complexity' }));
  return { id: 'head', baseId: 'base', findings,
    ratchet: { regressions: [], existing: findings, improved: [], removed: [] },
    coverage: { complete: false, unverified: Array.from({ length: 14 }, () => ({ reason: 'unknown owner' })) },
    metadata: { parserVersion: '5.4.5' } };
}

test('a workflow-only comparison leads with zero regressions despite existing debt', () => {
  const text = summaryText(compared());
  assert.match(text, /^Regressions: 0\n/);
  assert.match(text, /Current findings \(all rules\): 109/);
  assert.match(text, /Compared findings: existing 109, improved 0, removed 0/);
  assert.match(text, /complexity: 109/);
  assert.match(text, /Unverified: 14/);
});

test('actual growth remains the lead while improvement and removal counts stay distinct', () => {
  const report = compared();
  report.ratchet = { regressions: report.findings.slice(0, 1), existing: report.findings.slice(1, 101),
    improved: report.findings.slice(101), removed: [{ rule: 'nesting' }, { rule: 'nesting' }] };
  const text = summaryText(report);
  assert.match(text, /^Regressions: 1\n/);
  assert.match(text, /Compared findings: existing 100, improved 8, removed 2/);
  assert.match(text, /Current findings \(all rules\): 109/);
  assert.match(text, /Unverified: 14/);
});

test('an inventory with no base does not fabricate regression or compared-debt counts', () => {
  const report = { ...compared(), baseId: null, ratchet: null };
  const text = summaryText(report);
  assert.match(text, /^Inventory: no comparison\n/);
  assert.doesNotMatch(text, /Regressions:|Compared findings:/);
  assert.match(text, /Current findings \(all rules\): 109/);
  assert.match(text, /Unverified: 14/);
});

test('the presentation change preserves JSON and never mutates report observations', () => {
  const report = compared();
  const before = structuredClone(report);
  summaryText(report);
  assert.deepEqual(report, before);
  assert.equal(formatReport(report, 'json'), JSON.stringify(before, null, 2) + '\n');
});
