import ts from 'typescript';
import { patternBindings } from '../bindings/patterns.mjs';

export function declarationKinds(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return ['type'];
  if (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) return ['type', 'value'];
  if (ts.isModuleDeclaration(node)) return [];
  return ['value'];
}

export function declarationNames(node) {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(item => patternBindings(item.name, item).map(binding => binding.name));
  return node.name && ts.isIdentifier(node.name) ? [node.name.text] : [];
}

export function importBinding(declaration) {
  let owner = declaration;
  while (owner && !ts.isImportDeclaration(owner)) owner = owner.parent;
  if (!owner) return null;
  const name = ts.isNamespaceImport(declaration) ? '*' : ts.isImportClause(declaration)
    ? 'default' : (declaration.propertyName ?? declaration.name).text;
  return { specifier: owner.moduleSpecifier.text, name,
    typeOnly: Boolean(owner.importClause?.isTypeOnly || declaration.isTypeOnly) };
}
