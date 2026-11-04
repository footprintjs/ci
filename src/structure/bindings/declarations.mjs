import ts from 'typescript';
import { patternBindings } from './patterns.mjs';

export function addBinding(scope, name, declaration) {
  const entries = scope.names.get(name) ?? [];
  if (!entries.includes(declaration)) entries.push(declaration);
  scope.names.set(name, entries);
}

function varOwner(scope) {
  if (!scope.parent || scope.kind === 'body' || scope.kind === 'source') return scope;
  return varOwner(scope.parent);
}

function declarationScope(node, scope) {
  if (!ts.isVariableDeclaration(node)) return scope;
  if (ts.isCatchClause(node.parent)) return scope;
  return node.parent.flags & ts.NodeFlags.BlockScoped ? scope : varOwner(scope);
}

export function registerDeclaration(node, scope) {
  if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportClause(node) || ts.isImportEqualsDeclaration(node)) {
    if (node.name) addBinding(scope, node.name.text, node);
  } else if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    for (const item of patternBindings(node.name, node)) {
      addBinding(declarationScope(node, scope), item.name, item.declaration);
    }
  } else if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)
    || ts.isModuleDeclaration(node)) {
    if (node.name && ts.isIdentifier(node.name)) addBinding(scope, node.name.text, node);
  }
}
