import ts from 'typescript';
import { resolveBinding } from './resolve.mjs';

const observations = new WeakMap();

function writtenRoot(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left;
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return node.operand;
  return ts.isDeleteExpression(node) ? node.expression : null;
}

function rootIdentifier(node) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return rootIdentifier(node.expression);
  if (ts.isParenthesizedExpression(node)) return rootIdentifier(node.expression);
  return null;
}

function aliasOwners(identifier, seen = new Set()) {
  const declaration = resolveBinding(identifier)?.declaration;
  if (!declaration || seen.has(declaration)) return [];
  const result = [declaration];
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isIdentifier(declaration.initializer) &&
      (declaration.parent.flags & ts.NodeFlags.Const)) {
    result.push(...aliasOwners(declaration.initializer, new Set(seen).add(declaration)));
  }
  return result;
}

export function hasExplicitWrite(declaration) {
  if (observations.has(declaration)) return observations.get(declaration);
  let found = false;
  const visit = node => {
    const root = rootIdentifier(writtenRoot(node));
    if (root && aliasOwners(root).includes(declaration)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(declaration.getSourceFile());
  observations.set(declaration, found);
  return found;
}
