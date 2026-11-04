import ts from 'typescript';
import { resolveBinding } from './resolve.mjs';
import { isValueReference } from './references.mjs';

const indexes = new WeakMap();

function writtenRoot(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return node.left;
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) return node.operand;
  return ts.isDeleteExpression(node) ? node.expression : null;
}

function rootIdentifier(node) {
  if (!node) return null;
  if (ts.isIdentifier(node)) return node;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    || ts.isParenthesizedExpression(node)) return rootIdentifier(node.expression);
  return null;
}

function aliasOwners(identifier, seen = new Set()) {
  const declaration = resolveBinding(identifier)?.declaration;
  if (!declaration || seen.has(declaration)) return [];
  const result = [declaration];
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isIdentifier(declaration.initializer)
    && (declaration.parent.flags & ts.NodeFlags.Const)) {
    result.push(...aliasOwners(declaration.initializer, new Set(seen).add(declaration)));
  }
  return result;
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

function recordUse(node, index) {
  if (!ts.isIdentifier(node) || !isValueReference(node)) return;
  const owners = aliasOwners(node);
  if (!owners.length) return;
  if (!index.valueUses.has(owners[0])) index.valueUses.set(owners[0], []);
  index.valueUses.get(owners[0]).push(node);
  if (containedUse(node)) return;
  const offset = node.getStart();
  for (const owner of owners) index.escapeOffsets.set(owner, Math.min(index.escapeOffsets.get(owner) ?? Infinity, offset));
}

function buildIndex(sourceFile) {
  const index = { writes: new Set(), escapeOffsets: new Map(), valueUses: new Map() };
  const visit = node => {
    const root = rootIdentifier(writtenRoot(node));
    if (root) for (const owner of aliasOwners(root)) index.writes.add(owner);
    recordUse(node, index);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return index;
}

/** One syntax walk per immutable SourceFile; no program or runtime value analysis. */
export function bindingUses(sourceFile) {
  if (!indexes.has(sourceFile)) indexes.set(sourceFile, buildIndex(sourceFile));
  return indexes.get(sourceFile);
}
