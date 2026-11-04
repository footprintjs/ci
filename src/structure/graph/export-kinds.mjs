import ts from 'typescript';
import { patternBindings } from '../bindings/patterns.mjs';

function declarationName(node, name) {
  if (name === 'default' && node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)) return true;
  return node.name?.text === name;
}

function declarationMatches(node, name) {
  if (!ts.isVariableStatement(node)) return declarationName(node, name);
  return node.declarationList.declarations.flatMap(item => patternBindings(item.name, item))
    .some(item => item.name === name);
}

function declaredKind(node, name) {
  if (ts.isExportAssignment(node) && !node.isExportEquals && name === 'default') return 'value';
  if (!declarationMatches(node, name)) return null;
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return 'type';
  if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return 'unknown';
  if (ts.isVariableStatement(node) || ts.isClassDeclaration(node)) return 'value';
  if (ts.isFunctionDeclaration(node)) return node.body ? 'value' : 'unknown';
  if (ts.isEnumDeclaration(node)) return node.modifiers?.some(item => item.kind === ts.SyntaxKind.ConstKeyword) ? 'unknown' : 'value';
  return 'unknown';
}

/** Finite direct declaration/local-alias proof; forwarding/ambiguous owners stay unknown. */
export function exportedKind(parsed, name, seen = new Set()) {
  if (!parsed || seen.has(name)) return 'unknown';
  const next = new Set(seen).add(name);
  const kinds = parsed.sourceFile.statements.map(node => declaredKind(node, name)).filter(Boolean);
  if (kinds.includes('value')) return 'value';
  if (kinds.length && kinds.every(kind => kind === 'type')) return 'type';
  for (const node of parsed.sourceFile.statements) {
    if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) continue;
    const specifier = node.exportClause.elements.find(item => item.name.text === name);
    if (!specifier) continue;
    if (node.isTypeOnly || specifier.isTypeOnly) return 'type';
    if (!node.moduleSpecifier) return exportedKind(parsed, (specifier.propertyName ?? specifier.name).text, next);
  }
  return 'unknown';
}
