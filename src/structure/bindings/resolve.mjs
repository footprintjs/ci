import ts from 'typescript';
import { lexicalScope } from './scopes.mjs';
import { isValueReference } from './references.mjs';

function selectDeclaration(entries) {
  if (entries.length === 1) return entries[0];
  if (!entries.every(node => ts.isFunctionDeclaration(node))) return null;
  const implementations = entries.filter(node => node.body);
  return implementations.length === 1 ? implementations[0] : null;
}

export function resolveBinding(identifier) {
  if (!isValueReference(identifier)) return null;
  for (let scope = lexicalScope(identifier); scope; scope = scope.parent) {
    const entries = scope.names.get(identifier.text);
    if (!entries) continue;
    const declaration = selectDeclaration(entries);
    return declaration ? { declaration } : null;
  }
  return null;
}

/** Presence is distinct from choosing one declaration or proving its value. */
export function hasLexicalBinding(identifier) {
  if (!isValueReference(identifier)) return false;
  for (let scope = lexicalScope(identifier); scope; scope = scope.parent) {
    if (scope.names.has(identifier.text)) return true;
  }
  return false;
}
