import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSnapshots } from './report.mjs';

test('shrinking named function debt remains an advisory improvement', () => {
  const snapshot = count => ({ files: [{ path: 'src/work.ts',
    text: ['function work() {', ...Array(count).fill('  use();'), '}'].join('\n') }] });
  const result = checkSnapshots(snapshot(59), snapshot(60));
  assert.equal(result.status, 'advisory');
  assert.ok(result.ratchet, 'A supplied base must produce a comparison.');
  assert.ok(result.ratchet.improved.some(item => item.rule === 'function-lines'));
});

test('stage provenance and graph observations remain JSON data', () => {
  const result = checkSnapshots({ files: [{ path: 'src/chart.ts',
    text: "import { flowChart } from 'footprintjs'; flowChart('Root', () => {}, 'root');" }] });
  assert.ok(result.stages.length > 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
