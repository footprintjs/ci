import ts from 'typescript';

export function importOrigin(declaration) {
  if (!ts.isImportSpecifier(declaration) && !ts.isNamespaceImport(declaration) && !ts.isImportClause(declaration)) return null;
  let owner = declaration;
  while (owner && !ts.isImportDeclaration(owner)) owner = owner.parent;
  if (!owner || !ts.isStringLiteral(owner.moduleSpecifier)) return null;
  if (declaration.isTypeOnly || owner.importClause?.isTypeOnly) return null;
  const name = ts.isNamespaceImport(declaration) ? '*' :
    ts.isImportClause(declaration) ? 'default' : (declaration.propertyName ?? declaration.name).text;
  return { module: owner.moduleSpecifier.text, name };
}
