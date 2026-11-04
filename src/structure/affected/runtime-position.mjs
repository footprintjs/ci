import ts from 'typescript';

export function unwrapExpression(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

export function outerExpression(node) {
  while (node.parent && node.parent.expression === node && unwrapExpression(node.parent) !== node.parent) node = node.parent;
  return node;
}

function erasedContainer(node) {
  if (ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent)) {
    return node.parent.token !== ts.SyntaxKind.ExtendsKeyword || !ts.isClassLike(node.parent.parent);
  }
  return ts.isTypeNode(node) || ts.isInterfaceDeclaration(node)
    || Boolean(node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword));
}

export function runtimeSyntax(node) {
  if (node.getSourceFile().isDeclarationFile) return false;
  for (let owner = node; owner; owner = owner.parent) if (erasedContainer(owner)) return false;
  return true;
}

export function onlyTypeof(node) {
  const parent = outerExpression(node).parent;
  return Boolean(parent && ts.isTypeOfExpression(parent));
}
