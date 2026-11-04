import ts from 'typescript';
import { posix } from 'node:path';
import { resolveBinding, hasLexicalBinding } from '../bindings/index.mjs';
import { resolveImmutableValue } from '../bindings/immutable.mjs';

const LIBRARIES = new Set(['node:fs', 'fs', 'node:fs/promises', 'fs/promises']);
const READERS = new Set(['readFile', 'readFileSync', 'readdir', 'readdirSync', 'stat', 'statSync',
  'access', 'accessSync', 'existsSync', 'glob', 'globSync']);

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function importedFrom(declaration) {
  for (let owner = declaration; owner; owner = owner.parent) {
    if (ts.isImportDeclaration(owner)) return owner.importClause?.isTypeOnly ? null : owner.moduleSpecifier.text;
  }
  return null;
}

function constInitializer(declaration) {
  if (!ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent)
    || !(declaration.parent.flags & ts.NodeFlags.Const)) return null;
  return declaration.initializer ?? null;
}

function aliasInitializer(declaration) {
  return declaration && ts.isVariableDeclaration(declaration) ? declaration.initializer : null;
}

function namespace(node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return false;
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'promises') return namespace(node.expression, seen);
  if (!ts.isIdentifier(node)) return false;
  const declaration = resolveBinding(node)?.declaration;
  if (!declaration || seen.has(declaration)) return false;
  seen.add(declaration);
  const library = importedFrom(declaration);
  if (LIBRARIES.has(library)) return ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)
    || (ts.isImportSpecifier(declaration) && (declaration.propertyName ?? declaration.name).text === 'promises');
  return namespace(aliasInitializer(declaration), seen);
}

function fileReader(node, seen = new Set()) {
  node = unwrap(node);
  if (!node) return false;
  if (ts.isPropertyAccessExpression(node)) return READERS.has(node.name.text) && namespace(node.expression);
  if (!ts.isIdentifier(node)) return false;
  const declaration = resolveBinding(node)?.declaration;
  if (!declaration || seen.has(declaration)) return false;
  seen.add(declaration);
  if (ts.isImportSpecifier(declaration)) return !declaration.isTypeOnly
    && LIBRARIES.has(importedFrom(declaration)) && READERS.has((declaration.propertyName ?? declaration.name).text);
  if (ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
    const variable = declaration.parent.parent;
    return READERS.has((declaration.propertyName ?? declaration.name).getText()) && namespace(constInitializer(variable));
  }
  return fileReader(aliasInitializer(declaration), seen);
}

function readerStatus(expression) {
  const value = resolveImmutableValue(expression);
  if (value.origin && LIBRARIES.has(value.origin.module) && READERS.has(value.origin.name)) {
    return { known: true, name: value.origin.name };
  }
  const node = unwrap(expression);
  if (node && ts.isPropertyAccessExpression(node) && READERS.has(node.name.text)) {
    const receiver = resolveImmutableValue(node.expression);
    if (receiver.origin && LIBRARIES.has(receiver.origin.module)
      && ['*', 'default', 'promises'].includes(receiver.origin.name)) return { known: true, name: node.name.text };
  }
  return { known: false, possible: fileReader(expression) };
}

function importUrlPath(node, path) {
  if (!(ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL'
    && !hasLexicalBinding(node.expression) && node.arguments?.length === 2
    && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[1].getText() === 'import.meta.url')) return null;
  const target = node.arguments[0].text;
  if (!target.startsWith('.') || target.includes('://') || target.includes('\\') || /%(?:2f|5c)/i.test(target)) return null;
  try {
    return posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(target.split(/[?#]/)[0])));
  } catch {
    return null;
  }
}

function constantPath(node, path, seen = new Set()) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return posix.normalize(node.text);
  if (ts.isIdentifier(node)) {
    const declaration = resolveBinding(node)?.declaration;
    if (!declaration || seen.has(declaration)) return null;
    seen.add(declaration);
    return constantPath(constInitializer(declaration), path, seen);
  }
  return importUrlPath(node, path);
}

export function readerReferences(parsed) {
  const references = [];
  const unverified = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const reader = readerStatus(node.expression);
      const offset = node.getStart(parsed.sourceFile);
      const target = reader.known ? constantPath(node.arguments[0], parsed.path) : null;
      if (reader.possible || (reader.known && target === null)) unverified.push({ kind: 'source-reader', path: parsed.path,
        line: parsed.sourceFile.getLineAndCharacterOfPosition(offset).line + 1,
        reason: 'Filesystem reader provenance or path cannot be proved by the admitted immutable grammar.' });
      else if (reader.known && (target === 'src' || target.startsWith('src/'))) {
        references.push({ target, symbol: null, offset, exact: !['glob', 'globSync'].includes(reader.name) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return { references, unverified };
}
