import assert from 'node:assert/strict';
import test from 'node:test';
import { declarationFindings, NAME_EXEMPTIONS } from './declarations.mjs';

test('numeric export aliases are checked even when the private name is descriptive', () => {
  const source = { path: 'src/a.ts', topLevelLets: [], exports: [{ name: 'handler2', line: 1 }] };
  assert.ok(declarationFindings(source).some(item => item.rule === 'number-suffixed-export'));
  assert.ok(Object.isFrozen(NAME_EXEMPTIONS));
  for (const item of NAME_EXEMPTIONS) assert.ok(item.reason && item.evidence);
});
