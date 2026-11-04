import ts from 'typescript';
import { tokenHash, tokensBetween } from '../syntax/tokens.mjs';

export function runtimeCallable(node) {
  return ts.isFunctionLike(node) && node.body !== undefined;
}

export function runtimeClass(node) {
  if (!ts.isClassLike(node) || node.getSourceFile().isDeclarationFile) return false;
  for (let owner = node; owner; owner = owner.parent) {
    if (owner.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return false;
  }
  return true;
}

function nameCarrier(node) {
  const parent = node.parent;
  if (!parent) return null;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent;
  if ((ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.initializer === node
    && ts.isIdentifier(parent.name)) return parent;
  return null;
}

export function unitName(node) {
  if (node.name) return node.name.text ?? node.name.getText();
  const carrier = nameCarrier(node);
  if (carrier) return carrier.name.text ?? carrier.name.getText();
  const parent = node.parent;
  if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return parent.left.getText();
  }
  return ts.isConstructorDeclaration(node) ? 'constructor' : null;
}

export function unitKind(node) {
  if (ts.isClassLike(node)) return 'class';
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (ts.isGetAccessorDeclaration(node)) return 'getter';
  if (ts.isSetAccessorDeclaration(node)) return 'setter';
  if (ts.isMethodDeclaration(node)) return 'method';
  return ts.isArrowFunction(node) ? 'arrow' : 'function';
}

function ownerNames(node) {
  const names = [];
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (runtimeCallable(parent) || ts.isClassLike(parent) || ts.isObjectLiteralExpression(parent)
      || (ts.isModuleDeclaration(parent) && ts.isIdentifier(parent.name))) {
      const name = unitName(parent);
      if (name) names.unshift(name);
    }
  }
  return names;
}

export function unitIdentity(node, parsed) {
  const name = unitName(node);
  const kind = unitKind(node);
  const body = node.body ?? node;
  const bodyHash = tokenHash(tokensBetween(parsed, body.getStart(parsed.sourceFile), body.getEnd()));
  const qualified = [...ownerNames(node), name].filter(Boolean).join('.');
  const identity = name ? `${kind}:${qualified}` : `${kind}:anonymous:${bodyHash}`;
  return { name: name ?? '<anonymous>', kind, identity, bodyHash };
}
