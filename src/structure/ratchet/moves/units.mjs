import ts from 'typescript';
import { tokenHash, tokensBetween } from '../../syntax/tokens.mjs';

function declarationUnit(node, parsed, { kind, name, prefix = [] }) {
  const modifiers = new Set((node.modifiers ?? []).filter(item =>
    [ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(item.kind)).map(item => item.getStart(parsed.sourceFile)));
  const tokens = tokensBetween(parsed, node.getStart(parsed.sourceFile), node.getEnd())
    .filter(token => !modifiers.has(token.start));
  const bodyHash = tokenHash([...prefix, ...tokens]);
  return { kind, name, bodyHash, key: JSON.stringify([kind, name, bodyHash]),
    path: parsed.path, line: parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line + 1 };
}

function statementModifiers(node, parsed) {
  return (node.modifiers ?? []).filter(item => ![ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(item.kind))
    .flatMap(item => tokensBetween(parsed, item.getStart(parsed.sourceFile), item.getEnd()));
}

/** Whole top-level syntax only. A new function extracted from inside a body is absent here. */
export function topLevelUnits(parsed) {
  return parsed.sourceFile.statements.flatMap(node => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
      || ts.isExportDeclaration(node) || ts.isEmptyStatement(node)) return [];
    if (ts.isFunctionDeclaration(node) && node.body) {
      return [declarationUnit(node, parsed, { kind: 'function', name: node.name?.text ?? '<default>' })];
    }
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.map(item =>
      declarationUnit(item, parsed, { kind: `variable:${node.declarationList.flags & ts.NodeFlags.BlockScoped}`,
        name: item.name.getText(parsed.sourceFile), prefix: statementModifiers(node, parsed) }));
    return [declarationUnit(node, parsed, { kind: ts.SyntaxKind[node.kind], name: node.name?.getText(parsed.sourceFile) ?? null })];
  });
}
