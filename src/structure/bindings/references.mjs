import ts from 'typescript';

function memberName(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (ts.isBindingElement(parent) && (parent.name === node || parent.propertyName === node)) return true;
  return ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent);
}

/** A property spelling or declaration name is not a lexical value reference. */
export function isValueReference(node) {
  if (!ts.isIdentifier(node) || !node.parent) return false;
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (memberName(node) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  return parent.name !== node;
}
