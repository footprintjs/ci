import ts from 'typescript';
import { hasLexicalBinding } from '../bindings/index.mjs';
import { hasRuntimeValueUse, topLevelLoad } from './value-use.mjs';

function runtimeImport(node) {
  const clause = node.importClause;
  if (!clause) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return true;
  const entries = clause.namedBindings.elements;
  return entries.length === 0 || entries.some(entry => !entry.isTypeOnly);
}

function runtimeExport(node) {
  if (node.isTypeOnly) return false;
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true;
  const entries = node.exportClause.elements;
  return entries.length === 0 || entries.some(entry => !entry.isTypeOnly);
}

function importBindings(node) {
  const clause = node.importClause;
  if (!clause) return [];
  const named = clause.namedBindings;
  const bindings = named && ts.isNamedImports(named) ? named.elements.filter(item => !item.isTypeOnly) : named ? [named] : [];
  return clause.name ? [clause, ...bindings] : bindings;
}

function declarationSite(node) {
  if (!runtimeImport(node)) return null;
  const javascript = [ts.ScriptKind.JS, ts.ScriptKind.JSX].includes(node.getSourceFile().scriptKind);
  const uncertain = !javascript && Boolean(node.importClause) && !importBindings(node).some(hasRuntimeValueUse);
  return { expression: node.moduleSpecifier, eager: !uncertain, uncertain };
}

function equalsSite(node) {
  if (node.isTypeOnly) return null;
  if (!ts.isExternalModuleReference(node.moduleReference)) {
    return { expression: null, eager: false, uncertain: true };
  }
  const uncertain = !hasRuntimeValueUse(node);
  return { expression: node.moduleReference.expression, eager: !uncertain && topLevelLoad(node), uncertain };
}

function importSite(node) {
  if (ts.isImportDeclaration(node)) return declarationSite(node);
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && runtimeExport(node)) {
    const names = node.exportClause && ts.isNamedExports(node.exportClause)
      ? node.exportClause.elements.filter(item => !item.isTypeOnly).map(item => (item.propertyName ?? item.name).text) : null;
    const javascript = [ts.ScriptKind.JS, ts.ScriptKind.JSX].includes(node.getSourceFile().scriptKind);
    return { expression: node.moduleSpecifier, eager: true, reexportNames: javascript ? null : names };
  }
  if (ts.isImportEqualsDeclaration(node)) return equalsSite(node);
  if (!ts.isCallExpression(node)) return null;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return { expression: node.arguments[0], eager: false };
  if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && !hasLexicalBinding(node.expression)) {
    return { expression: node.arguments[0], eager: topLevelLoad(node) };
  }
  return null;
}

export function runtimeImports(parsed) {
  const imports = [];
  const unverified = [];
  const visit = node => {
    const site = importSite(node);
    if (site) {
      const line = parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line + 1;
      if (site.expression && ts.isStringLiteralLike(site.expression)) {
        imports.push({ specifier: site.expression.text, eager: site.eager, uncertain: Boolean(site.uncertain), line,
          ...(site.reexportNames ? { reexportNames: site.reexportNames } : {}) });
      } else unverified.push({ kind: 'module-resolution', path: parsed.path, line,
        reason: 'Dynamic runtime module expression cannot establish a complete source closure.' });
      if (site.uncertain) unverified.push({ kind: 'module-elision', path: parsed.path, line,
        reason: 'No admitted runtime value use proves this import emits; compiler elision/verbatim settings are unknown.' });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return { imports, unverified };
}
