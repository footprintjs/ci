import ts from 'typescript';
import { isBuiltin } from 'node:module';
import { resolveRelative } from '../sources/paths.mjs';

const PROCESS_PACKAGES = new Set(['child_process', 'node:child_process', 'worker_threads', 'node:worker_threads',
  'execa', 'zx', 'shelljs']);

export function importNames(node) {
  const clause = node.importClause;
  if (!clause || clause.isTypeOnly) return [];
  const names = clause.name ? [{ local: clause.name.text, name: 'default' }] : [];
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) names.push({ local: bindings.name.text, name: '*' });
  if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.filter(item => !item.isTypeOnly)
    .map(item => ({ local: item.name.text, name: (item.propertyName ?? item.name).text })));
  return names;
}

export function erasedImport(node) {
  const clause = node.importClause;
  return Boolean(clause?.isTypeOnly) || Boolean(clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
    && !clause.name && clause.namedBindings.elements.length && !importNames(node).length);
}

export function makeRequest(source, node, details, context) {
  const line = source.sourceFile.getLineAndCharacterOfPosition(node.getStart(source.sourceFile)).line + 1;
  const request = { ...details, path: source.path, line };
  if (typeof details.specifier !== 'string') return { ...request, reason: 'Dynamic loader target is unresolved.' };
  if (details.specifier.startsWith('.')) {
    const found = resolveRelative(source.path, details.specifier, context.files);
    return { ...request, target: found.path, reason: found.reason };
  }
  const specifier = details.specifier;
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (isBuiltin(specifier)) return { ...request, external: true };
  if (context.sourcePackages?.has(name)) return { ...request, reason: 'Tracked package source ownership is unresolved; a dependency declaration does not prove it external.' };
  if (context.unknownSourcePackages) return { ...request, reason: 'Unreadable nested package metadata prevents proving this bare import external.' };
  if (context.packages.has(name)) return { ...request, external: true };
  return { ...request, reason: 'Bare source alias or undeclared external owner is unresolved.' };
}

export function processExecutionRequest(request) {
  return PROCESS_PACKAGES.has(request.specifier?.split('/')[0]);
}

export function filesystemRequest(request) {
  return ['fs', 'node:fs', 'fs/promises', 'node:fs/promises', 'path', 'node:path',
    'glob', 'fast-glob', 'tinyglobby', 'fs-extra'].includes(request.specifier);
}
