import ts from 'typescript';
import { patternBindings } from '../bindings/patterns.mjs';
import { hasLexicalBinding } from '../bindings/index.mjs';
import { erasedImport, importNames, makeRequest, filesystemRequest } from './requests.mjs';

function addExport(info, name, entry) {
  info.exports.set(name, [...(info.exports.get(name) ?? []), entry]);
}

function recordImport(node, info, source, context) {
  if (erasedImport(node)) return;
  const bindings = importNames(node);
  const request = makeRequest(source, node, { specifier: node.moduleSpecifier.text,
    names: bindings.length ? bindings.map(item => item.name) : ['*'], effect: !bindings.length }, context);
  info.requests.push(request);
  for (const binding of bindings) info.imports.set(binding.local, { ...request, names: [binding.name] });
}

function recordExport(node, info, source, context) {
  if (node.isTypeOnly) return;
  if (!node.moduleSpecifier) {
    for (const item of node.exportClause?.elements ?? []) {
      if (!item.isTypeOnly) addExport(info, item.name.text, { local: (item.propertyName ?? item.name).text });
    }
    return;
  }
  const items = node.exportClause && ts.isNamedExports(node.exportClause)
    ? node.exportClause.elements.filter(item => !item.isTypeOnly) : null;
  if (items && !items.length) return;
  const request = makeRequest(source, node, { specifier: node.moduleSpecifier.text,
    names: items ? items.map(item => (item.propertyName ?? item.name).text) : ['*'], reexport: true }, context);
  info.requests.push(request);
  if (!node.exportClause) info.stars.push(request);
  else if (ts.isNamespaceExport(node.exportClause)) addExport(info, node.exportClause.name.text, { request });
  else for (const item of items) addExport(info, item.name.text, { request: { ...request, names: [(item.propertyName ?? item.name).text] } });
}

function recordDeclaration(node, info) {
  const names = ts.isVariableStatement(node) ? node.declarationList.declarations
    .flatMap(item => patternBindings(item.name, item).map(binding => binding.name)) : node.name?.text ? [node.name.text] : [];
  for (const name of names) info.locals.add(name);
  if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)
    || (ts.isExportAssignment(node) && !node.isExportEquals)) addExport(info, 'default', { owner: true });
  else if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) {
    for (const name of names) addExport(info, name, { owner: true });
  }
}

function loadEffects(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isFunctionDeclaration(node)
    || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isEmptyStatement(node)) return false;
  if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword)) return false;
  if (ts.isVariableStatement(node)) return !node.declarationList.declarations.every(item => item.initializer
    && (ts.isArrowFunction(item.initializer) || ts.isFunctionExpression(item.initializer)));
  return !(ts.isExportAssignment(node) && (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)));
}

function loadingCalls(source, info, context) {
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const literal = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const require = ts.isIdentifier(node.expression) && node.expression.text === 'require' && !hasLexicalBinding(node.expression);
      if (literal || require) info.requests.push(makeRequest(source, node, {
        specifier: node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : null,
        names: ['*'], dynamic: true }, context));
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
}

export function moduleInfo(source, context) {
  const info = { path: source.path, imports: new Map(), exports: new Map(), locals: new Set(),
    requests: [], stars: [], effects: source.sourceFile.statements.some(loadEffects) };
  for (const node of source.sourceFile.statements) {
    if (ts.isImportDeclaration(node)) recordImport(node, info, source, context);
    else if (ts.isExportDeclaration(node)) recordExport(node, info, source, context);
    else recordDeclaration(node, info);
  }
  loadingCalls(source, info, context);
  info.reader = info.requests.some(filesystemRequest);
  return info;
}
