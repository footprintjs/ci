import ts from 'typescript';
import { patternBindings } from '../bindings/patterns.mjs';
import { erasedImport, importNames, makeRequest, filesystemRequest, processExecutionRequest } from './requests.mjs';
import { loadEffects } from './effects.mjs';
import { loadingRequests } from './loaders.mjs';
import { erasedCompanions } from './companions.mjs';

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

function localExports(node, info) {
  for (const item of node.exportClause?.elements ?? []) {
    if (!item.isTypeOnly) addExport(info, item.name.text, { local: (item.propertyName ?? item.name).text });
  }
}

function recordExport(node, info, source, context) {
  if (node.isTypeOnly) return;
  if (!node.moduleSpecifier) {
    localExports(node, info);
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
  if (info.companions.has(node)) return;
  const names = ts.isVariableStatement(node) ? node.declarationList.declarations
    .flatMap(item => patternBindings(item.name, item).map(binding => binding.name)) : node.name?.text ? [node.name.text] : [];
  for (const name of names) info.locals.add(name);
  if (ts.isExportAssignment(node) && !node.isExportEquals) {
    addExport(info, 'default', ts.isIdentifier(node.expression) ? { local: node.expression.text } : { owner: 'default' });
  } else if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)) {
    addExport(info, 'default', { owner: node.name?.text ?? 'default' });
  }
  else if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) {
    for (const name of names) addExport(info, name, { owner: name });
  }
}

function recordEquals(node, info, source, context) {
  if (node.isTypeOnly) return;
  const expression = ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : null;
  const request = makeRequest(source, node, { names: ['*'], effect: true,
    specifier: expression && ts.isStringLiteralLike(expression) ? expression.text : null }, context);
  info.requests.push(request);
  info.imports.set(node.name.text, request);
  if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) addExport(info, node.name.text, { request });
}

export function moduleInfo(source, context) {
  const info = { path: source.path, imports: new Map(), exports: new Map(), locals: new Set(), unverified: [],
    requests: [], stars: [], effects: source.sourceFile.statements.some(loadEffects), companions: erasedCompanions(source.sourceFile) };
  for (const node of source.sourceFile.statements) {
    if (ts.isImportDeclaration(node)) recordImport(node, info, source, context);
    else if (ts.isImportEqualsDeclaration(node)) recordEquals(node, info, source, context);
    else if (ts.isExportDeclaration(node)) recordExport(node, info, source, context);
    else recordDeclaration(node, info);
  }
  const loaders = loadingRequests(source, context);
  info.requests.push(...loaders.requests);
  info.unverified.push(...loaders.unverified);
  if (info.requests.some(item => ['module', 'node:module', 'vm', 'node:vm'].includes(item.specifier))) {
    info.unverified.push({ kind: 'affected-loading', path: source.path, line: 1,
      reason: 'Module/VM loader construction is outside the admitted direct-loader grammar.' });
  }
  info.reader = info.requests.some(filesystemRequest);
  info.processLoader = info.requests.some(processExecutionRequest);
  if (info.processLoader) info.unverified.push({ kind: 'affected-process-loading', path: source.path, line: 1,
    reason: 'Process/worker execution may load tracked source outside the static module graph; command arguments are not interpreted.' });
  return info;
}
