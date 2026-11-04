import ts from 'typescript';

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(element => ts.isBindingElement(element) ? bindingNames(element.name) : []);
}

function exportKind(node) {
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return 'type';
  if (ts.isEnumDeclaration(node)) return 'enum';
  return ts.isModuleDeclaration(node) ? 'namespace' : 'variable';
}

function exportNames(node) {
  if (ts.isExportAssignment(node)) return [{ name: node.isExportEquals ? 'export=' : 'default', kind: 'assignment' }];
  if (ts.isExportDeclaration(node)) {
    if (!node.exportClause) return [{ name: '*', kind: 'star' }];
    const entries = ts.isNamedExports(node.exportClause) ? node.exportClause.elements : [node.exportClause];
    return entries.map(entry => ({ name: entry.name.text, kind: node.isTypeOnly || entry.isTypeOnly ? 'type' : 'alias' }));
  }
  const modifiers = node.modifiers ?? [];
  if (!modifiers.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) return [];
  if (modifiers.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)) return [{ name: 'default', kind: exportKind(node) }];
  const names = ts.isVariableStatement(node) ? node.declarationList.declarations.flatMap(item => bindingNames(item.name))
    : node.name ? [node.name.text ?? node.name.getText()] : [];
  return names.map(name => ({ name, kind: exportKind(node) }));
}

export function measureDeclarations(sourceFile) {
  const topLevelLets = [];
  const exports = [];
  for (const node of sourceFile.statements) {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Let)) {
      for (const item of node.declarationList.declarations) {
        for (const name of bindingNames(item.name)) topLevelLets.push({ name, line });
      }
    }
    exports.push(...exportNames(node).map(entry => ({ ...entry, line })));
  }
  return { topLevelLets, exports };
}
