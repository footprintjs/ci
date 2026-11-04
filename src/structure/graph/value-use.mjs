import ts from 'typescript';
import { resolveBinding } from '../bindings/index.mjs';
import { isValueReference } from '../bindings/references.mjs';

const observations = new WeakMap();
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

function erasedContext(node) {
  if (node.getSourceFile().isDeclarationFile) return true;
  for (let owner = node; owner; owner = owner.parent) {
    if (owner.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return true;
    if (ts.isEnumDeclaration(owner) && owner.modifiers?.some(item => item.kind === ts.SyntaxKind.ConstKeyword)) return true;
  }
  return false;
}

function typeContainer(node) {
  if (ts.isExpressionWithTypeArguments(node) && ts.isHeritageClause(node.parent)) {
    return node.parent.token !== ts.SyntaxKind.ExtendsKeyword || !ts.isClassLike(node.parent.parent);
  }
  return ts.isTypeNode(node) || ts.isInterfaceDeclaration(node);
}

function runtimePosition(identifier) {
  if (erasedContext(identifier)) return false;
  for (let owner = identifier.parent; owner; owner = owner.parent) {
    if (typeContainer(owner) || ts.isImportEqualsDeclaration(owner)) return false;
  }
  return true;
}

/** Runtime syntax use of this exact lexical declaration, not a same-spelled name. */
export function hasRuntimeValueUse(declaration) {
  if (observations.has(declaration)) return observations.get(declaration);
  let found = false;
  const visit = node => {
    if (found) return;
    if (ts.isIdentifier(node) && isValueReference(node) &&
        resolveBinding(node)?.declaration === declaration && runtimePosition(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(declaration.getSourceFile());
  observations.set(declaration, found);
  return found;
}

function loopDeferred(owner, child) {
  if (ts.isForStatement(owner)) return child !== owner.initializer && child !== owner.condition;
  if (ts.isForInStatement(owner) || ts.isForOfStatement(owner)) return child !== owner.expression;
  if (ts.isWhileStatement(owner)) return child !== owner.expression;
  return ts.isDoStatement(owner);
}

function controlDeferred(owner, child) {
  if (ts.isIfStatement(owner)) return child !== owner.expression;
  if (ts.isConditionalExpression(owner)) return child !== owner.condition;
  if (ts.isSwitchStatement(owner)) return child !== owner.expression;
  if (ts.isTryStatement(owner)) return child !== owner.tryBlock && child !== owner.finallyBlock;
  if (ts.isBinaryExpression(owner) && LOGICAL.has(owner.operatorToken.kind)) return child === owner.right;
  return loopDeferred(owner, child);
}

function fieldDeferred(owner, child) {
  return ts.isPropertyDeclaration(owner) && child === owner.initializer &&
    !owner.modifiers?.some(item => item.kind === ts.SyntaxKind.StaticKeyword);
}

/** Eager is a finite syntactic lower bound; deferred/unsupported timing stays potential. */
export function topLevelLoad(node) {
  if (erasedContext(node)) return false;
  for (let owner = node.parent, child = node; owner; child = owner, owner = owner.parent) {
    if (ts.isSourceFile(owner)) return true;
    if (ts.isFunctionLike(owner) && owner.body && child !== owner.name && !ts.isDecorator(child)) return false;
    if (controlDeferred(owner, child) || fieldDeferred(owner, child)) return false;
    if (ts.isCallExpression(owner) && (owner.flags & ts.NodeFlags.OptionalChain) && child !== owner.expression) return false;
  }
  return false;
}
