import ts from 'typescript';
import { resolveBinding } from './resolve.mjs';
import { isValueReference } from './references.mjs';

function aliases(identifier, declaration, seen = new Set()) {
  const binding = resolveBinding(identifier)?.declaration;
  if (!binding || seen.has(binding)) return false;
  if (binding === declaration) return true;
  if (!ts.isVariableDeclaration(binding) || !binding.initializer || !ts.isIdentifier(binding.initializer)) return false;
  return Boolean(binding.parent.flags & ts.NodeFlags.Const) &&
    aliases(binding.initializer, declaration, new Set(seen).add(binding));
}

function containedUse(node) {
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
    return Boolean(parent.parent.flags & ts.NodeFlags.Const);
  }
  if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) {
    return parent.expression === node && ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
  }
  if (ts.isCallExpression(parent) || ts.isNewExpression(parent)) return parent.expression === node;
  return ts.isExpressionStatement(parent);
}

/** A prior external argument/return/container escape cannot prove a handle unchanged. */
export function escapedBefore(declaration, reference) {
  let found = false;
  const before = reference.getStart();
  const visit = node => {
    if (ts.isIdentifier(node) && node.getStart() < before && isValueReference(node) &&
        aliases(node, declaration) && !containedUse(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(declaration.getSourceFile());
  return found;
}
