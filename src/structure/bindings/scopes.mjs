import ts from 'typescript';
import { addBinding, registerDeclaration } from './declarations.mjs';

const indexes = new WeakMap();

function scopeKind(node) {
  if (ts.isSourceFile(node)) return 'source';
  if (ts.isFunctionLike(node)) return 'parameters';
  if (ts.isClassLike(node)) return 'class';
  if (ts.isCatchClause(node)) return 'catch';
  if (ts.isClassStaticBlockDeclaration(node) || ts.isModuleBlock(node)) return 'body';
  if (ts.isBlock(node)) return node.parent.body === node && ts.isFunctionLike(node.parent) ? 'body' : 'block';
  if (ts.isCaseBlock(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) return 'block';
  return null;
}

function buildIndex(sourceFile) {
  const scopes = new WeakMap();
  const visit = (node, parentScope) => {
    if (parentScope) registerDeclaration(node, parentScope);
    const kind = scopeKind(node);
    const scope = kind ? { kind, parent: parentScope, names: new Map() } : parentScope;
    if (kind) scopes.set(node, scope);
    if ((ts.isFunctionExpression(node) || ts.isClassLike(node)) && node.name) {
      addBinding(scope, node.name.text, node);
    }
    ts.forEachChild(node, child => visit(child, scope));
  };
  visit(sourceFile, null);
  return scopes;
}

export function lexicalScope(identifier) {
  const source = identifier.getSourceFile();
  if (!indexes.has(source)) indexes.set(source, buildIndex(source));
  const scopes = indexes.get(source);
  for (let node = identifier; node; node = node.parent) {
    if (scopes.has(node)) return scopes.get(node);
  }
  return null;
}
