import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';
import { outerExpression, unwrapExpression, runtimeSyntax, onlyTypeof } from './runtime-position.mjs';

function references(text, name) {
  const source = parseSource({path:'src/fixture.ts',text});
  const found = [];
  const visit = node => { if (ts.isIdentifier(node) && node.text === name) found.push(node); ts.forEachChild(node, visit); };
  visit(source.sourceFile);
  return found;
}

test('nested transparent wrappers preserve the real property receiver and typeof-only observation', () => {
  const [identifier] = references('const host = ((globalThis as any)!).process;', 'globalThis');
  assert.ok(identifier, 'missing global expression');
  const outer = outerExpression(identifier);
  assert.equal(unwrapExpression(outer), identifier);
  assert.equal(outer.parent.name.text, 'process');
  const [required] = references('typeof (require as any)', 'require');
  assert.ok(required);
  assert.equal(onlyTypeof(required), true);
});

test('class extends expressions remain runtime while interface/type positions are erased', () => {
  const uses = references('class Host extends Base {} interface View extends Base {} type Kind = typeof Base;', 'Base');
  assert.equal(uses.length, 3);
  assert.deepEqual(uses.map(runtimeSyntax), [true, false, false]);
});
