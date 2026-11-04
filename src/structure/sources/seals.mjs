import ts from 'typescript';
import { parseSource } from '../syntax/parse.mjs';

function codeStatement(node) {
  if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)
    || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEmptyStatement(node)) return false;
  return !node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword);
}

/** A pure reexport/type barrel is an entry, but does not seal direct leaf imports. */
export function effectiveSeals(candidates, files, parsedFiles = new Map()) {
  return candidates.filter(seal => {
    const parsed = parsedFiles.get(seal.facade) ?? parseSource(files.get(seal.facade));
    return parsed.sourceFile.statements.some(codeStatement);
  });
}
