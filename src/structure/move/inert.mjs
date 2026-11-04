import ts from 'typescript';

function literal(expression) {
  return ts.isLiteralExpression(expression) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword].includes(expression.kind);
}

export function inertUnit(node) {
  if (ts.isFunctionDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
    || node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return true;
  if (!ts.isVariableStatement(node) || !(node.declarationList.flags & ts.NodeFlags.Const)) return false;
  return node.declarationList.declarations.every(item => item.initializer &&
    (literal(item.initializer) || ts.isArrowFunction(item.initializer) || ts.isFunctionExpression(item.initializer)));
}
