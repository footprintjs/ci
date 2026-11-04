import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { importOrigin } from './imports.mjs';

test('a runtime alias has its declared owner while erased imports prove no runtime value', () => {
  const parsed = parseSource({ path: 'src/a.ts', text: "import { flowChart as chart } from 'footprintjs'; import type { select } from 'footprintjs';" });
  const declarations = parsed.sourceFile.statements.map(item => item.importClause.namedBindings.elements[0]);
  assert.deepEqual(importOrigin(declarations[0]), { module: 'footprintjs', name: 'flowChart' });
  assert.equal(importOrigin(declarations[1]), null);
});
