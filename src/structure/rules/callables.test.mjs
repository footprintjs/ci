import assert from 'node:assert/strict';
import test from 'node:test';
import { callableFindings } from './callables.mjs';

test('JSX allowance does not suppress excessive branches', () => {
  const source = { path: 'src/view.tsx', functions: [{ name: 'View', identity: 'arrow:View', jsx: true,
    codeLines: 100, complexity: 16, depth: 0, parameters: 0 }] };
  assert.deepEqual(callableFindings(source).map(item => item.rule), ['complexity']);
});
