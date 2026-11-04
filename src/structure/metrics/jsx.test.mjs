import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSource } from '../syntax/parse.mjs';
import { jsxComponent } from './jsx.mjs';

test('a child component does not grant a JSX allowance to its parent', () => {
  const parsed = parseSource({ path: 'src/a.tsx', text: 'function Wrapper() { function Child() { return <p />; } return null; }' });
  const outer = parsed.sourceFile.statements[0];
  assert.equal(jsxComponent(outer), false);
  assert.equal(jsxComponent(outer.body.statements[0]), true);
});
