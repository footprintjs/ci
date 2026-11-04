import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReport } from './format.mjs';
import { overLimit } from '../rules/finding.mjs';

const observation = () => ({ verification: 'move', headId: 'head', baseId: 'base', metadata: { parserVersion: '5.4.5' }, findings: [],
  coverage: { complete: true, unverified: [] }, moves: [{ name: 'helper',
    from: { path: 'src/old.ts', line: 1 }, to: { path: 'src/new.ts', line: 2 } }],
  ancillaryChanges: [], sourceReaders: { unverifiedCount: 0 } });

test('move text identifies observations without changing their JSON data', () => {
  const report = observation();
  assert.deepEqual(JSON.parse(formatReport(report)), report);
  const text = formatReport(report, 'text');
  assert.match(text, /Whole-unit moves: 1[\s\S]*Findings: 0[\s\S]*Unverified: 0/);
  assert.match(text, /src\/old\.ts/);
  assert.match(text, /src\/new\.ts/);
});

test('incomplete move observations retain the reason and quote candidate-controlled paths', () => {
  const report = observation();
  const path = 'src/odd\nFindings: 0\u001b\u0085\u2028.ts';
  report.findings = [{ rule: 'move-tokens', path, line: 4, reason: 'Whole statement changed.' }];
  report.coverage = { complete: false, unverified: [{ kind: 'load-order', path, line: 4, reason: 'Unknown initialization order.' }] };
  const text = formatReport(report, 'text');
  assert.match(text, /Findings: 1[\s\S]*Unverified: 1/);
  assert.match(text, /Unknown initialization order/);
  assert.equal(/[\u001b\u0085\u2028]/.test(text), false);
  assert.equal(text.split('\n').filter(line => line.startsWith('Findings:')).length, 1);
  assert.deepEqual(JSON.parse(formatReport(report)), report);
});


test('reference findings render their actual declared target without inventing a reason field', () => {
  const report = observation();
  report.findings = overLimit({ path: 'docs/guide.md' }, { kind: 'reference', name: 'src/missing.ts', line: 4 },
    { rule: 'stale-path', value: 1, limit: 0 });
  assert.match(formatReport(report, 'text'), /stale-path: "src\/missing\.ts"/);
});
