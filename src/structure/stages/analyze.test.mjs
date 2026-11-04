import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { measureParsed } from '../metrics/measure.mjs';
import { stageAnalysis } from './analyze.mjs';

function analyze(text) {
  const parsed = parseSource({ path: 'src/a.ts', text });
  return stageAnalysis(parsed, measureParsed(parsed));
}

test('immutable callback aliases receive the stage ceiling with JSON registration evidence', () => {
  const body = ['function work(scope) {', ...Array(39).fill('  scope.use();'), '}'].join('\n');
  const result = analyze(`import * as fp from 'footprintjs'; ${body}
    const callback = work; const graph = fp.flowChart('Root', () => {}, 'root');
    graph.addFunction('Work', callback, 'work');`);
  assert.ok(result.findings.some(item => item.rule === 'stage-lines'));
  assert.deepEqual(result.unverified, []);
  assert.ok(result.stages.some(item => item.registration.method === 'addFunction' && Number.isInteger(item.callbackStart)));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('unknown receiver and unavailable callback bodies remain explicitly incomplete', () => {
  const result = analyze("import { flowChart } from 'footprintjs'; const callback = loadStage(); flowChart('R', callback, 'r'); getBuilder().addFunction('W', callback, 'w');");
  assert.ok(result.unverified.length >= 2);
  assert.ok(result.unverified.every(item => item.kind === 'stage-binding' && item.path === 'src/a.ts'));
});
