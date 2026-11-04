import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from './parse.mjs';

test('TSX parsing preserves parent relationships without evaluating source', () => {
  const parsed = parseSource({ path: 'src/view.tsx', text: 'throw Error("data"); const View = () => <p />;' });
  assert.deepEqual(parsed.sourceFile.parseDiagnostics, []);
  assert.equal(parsed.sourceFile.statements[0].parent, parsed.sourceFile);
  assert.ok(parsed.codeLineSet.has(1));
});
