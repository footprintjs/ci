import ts from 'typescript';
import { resolveBinding } from './resolve.mjs';
import { importOrigin } from './imports.mjs';
import { hasExplicitWrite } from './writes.mjs';
import { escapedBefore } from './escapes.mjs';

const unknown = reason => ({ status: 'unknown', reason });

function unwrap(node) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return unwrap(node.expression);
  return node;
}

function readImport({ declaration, reference, origin }) {
  if (hasExplicitWrite(declaration) || escapedBefore(declaration, reference)) {
    return unknown('Explicit writes or prior external-use syntax make import provenance unverified.');
  }
  return { status: 'resolved', origin };
}

function fromDeclaration({ declaration, reference, seen }) {
  const origin = importOrigin(declaration);
  if (origin) return readImport({ declaration, reference, origin });
  if (ts.isFunctionDeclaration(declaration) || ts.isClassDeclaration(declaration)) {
    return { status: 'resolved', node: declaration };
  }
  if (!ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)) {
    return unknown('The lexical binding has no admitted immutable value.');
  }
  if (!(declaration.parent.flags & ts.NodeFlags.Const) || !declaration.initializer) return unknown('Mutable or uninitialized alias.');
  if (reference.getStart() < declaration.getEnd()) return unknown('Alias used before its initialization is proven complete.');
  if (hasExplicitWrite(declaration)) return unknown('An explicit write can change the alias or its properties.');
  const initializer = unwrap(declaration.initializer);
  if ((ts.isObjectLiteralExpression(initializer) || ts.isCallExpression(initializer) || ts.isNewExpression(initializer)) &&
      escapedBefore(declaration, reference)) return unknown('Prior external-use syntax prevents unchanged-handle proof.');
  return resolveImmutableValue(declaration.initializer, seen);
}

export function resolveImmutableValue(expression, seen = new Set()) {
  if (!expression) return unknown('Missing expression.');
  const node = unwrap(expression);
  if (seen.has(node)) return unknown('Cyclic alias.');
  const next = new Set(seen).add(node);
  if (ts.isIdentifier(node)) {
    const binding = resolveBinding(node);
    return binding ? fromDeclaration({ ...binding, reference: node, seen: next }) : unknown('Unresolved lexical binding.');
  }
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = resolveImmutableValue(node.expression, next);
    if (receiver.origin?.name === '*') return { status: 'resolved', origin: { ...receiver.origin, name: node.name.text } };
  }
  return { status: 'resolved', node };
}
