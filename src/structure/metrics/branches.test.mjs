import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { branchMetrics } from './branches.mjs';

test('else-if is a sibling and nested callbacks own their decisions', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'function work() { if (a) use(); else if (b) use(); consume(() => { while (c) use(); }); }' });
  assert.deepEqual(branchMetrics(parsed.sourceFile.statements[0].body), { complexity: 3, depth: 1 });
});

test('default initializers own their decisions while nested initializer callbacks do not', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: 'function work(value = ready ? first : second, lazy = () => a && b) {}' });
  const fn = parsed.sourceFile.statements[0];
  assert.deepEqual(branchMetrics(fn.body, fn.parameters.map(item => item.initializer)), { complexity: 2, depth: 1 });
});
