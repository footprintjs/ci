import ts from 'typescript';
import { codePath } from '../sources/paths.mjs';

export function runnableTest(path) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

export function changedPaths(head, base) {
  return [...new Set([...head.keys(), ...base.keys()])].filter(path =>
    !head.has(path) || !base.has(path) || ['text', 'oid', 'mode', 'content']
      .some(key => head.get(path)[key] !== base.get(path)[key])).sort();
}

export function executableChange(path, head, base) {
  const before = base.get(path)?.mode;
  const after = head.get(path)?.mode;
  return before !== after && [before, after].includes('100755');
}

export function wholeSuiteInput(path) {
  return /(?:^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(path)
    || /(?:^|\/)(?:[^/]*config(?:\.[^/]*)?|\.[^/]*rc(?:\.[^/]*)?)$/.test(path)
    || /(?:^|\/)(?:config|configs|\.github)\//.test(path)
    || /(?:^|\/)(?:test|tests|__tests__)\/(?:helpers?|fixtures?|setup)(?:[./]|$)/.test(path)
    || /(?:^|\/)(?:setup[^/]*|[^/]*\.(?:fixture|helper))\.[cm]?[jt]sx?$/.test(path);
}

function erasedStatement(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEmptyStatement(node)) return true;
  if (ts.isImportDeclaration(node)) return Boolean(node.importClause?.isTypeOnly)
    || Boolean(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
      && !node.importClause.name && node.importClause.namedBindings.elements.length
      && node.importClause.namedBindings.elements.every(item => item.isTypeOnly));
  if (ts.isExportDeclaration(node)) return node.isTypeOnly || Boolean(node.exportClause
    && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every(item => item.isTypeOnly));
  return false;
}

export function erasedSource(parsed) {
  return !parsed || (/\.[cm]?tsx?$/.test(parsed.path) && !parsed.sourceFile.parseDiagnostics.length
    && parsed.sourceFile.statements.every(erasedStatement));
}

export function compilerChange(path) {
  return codePath(path) || wholeSuiteInput(path) || /\.jsonc?$/.test(path);
}
