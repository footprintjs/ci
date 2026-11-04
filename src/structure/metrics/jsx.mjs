import ts from 'typescript';
import { runtimeCallable, unitName } from './identity.mjs';

function containsJsx(expression) {
  if (!expression || runtimeCallable(expression)) return false;
  if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression) || ts.isJsxFragment(expression)) return true;
  let found = false;
  ts.forEachChild(expression, child => { if (containsJsx(child)) found = true; });
  return found;
}

export function jsxComponent(node) {
  if (!/^[A-Z]/.test(unitName(node) ?? '')) return false;
  if (!ts.isBlock(node.body)) return containsJsx(node.body);
  let found = false;
  const visit = child => {
    if (runtimeCallable(child)) return;
    if (ts.isReturnStatement(child) && containsJsx(child.expression)) found = true;
    ts.forEachChild(child, visit);
  };
  visit(node.body);
  return found;
}
