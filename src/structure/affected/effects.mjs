import ts from 'typescript';

function inertExpression(node) {
  if (!node) return false;
  if (ts.isLiteralExpression(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true;
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)) return inertExpression(node.expression);
  return false;
}

/** A finite inert grammar; unknown initialization remains a possible load effect. */
export function loadEffects(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)
    || ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
    || ts.isExportDeclaration(node) || ts.isEmptyStatement(node)) return false;
  if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return false;
  if (ts.isVariableStatement(node)) return !(node.declarationList.flags & ts.NodeFlags.Const)
    || !node.declarationList.declarations.every(item => inertExpression(item.initializer));
  return !(ts.isExportAssignment(node) && inertExpression(node.expression));
}
