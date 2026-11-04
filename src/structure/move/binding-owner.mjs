import ts from 'typescript';
import { resolveBinding } from '../bindings/index.mjs';
import { moduleModel } from './module.mjs';
import { importBinding, declarationKinds } from './declarations.mjs';
import { forwarded } from './exports.mjs';

const GLOBALS = new Set(['undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String', 'Number', 'Boolean', 'BigInt', 'Symbol',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Error', 'TypeError', 'RangeError', 'Math', 'JSON', 'Reflect', 'RegExp',
  'Date', 'Readonly', 'ReadonlyArray', 'Record', 'Partial', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract', 'ReturnType',
  'Parameters', 'Awaited', 'Iterable', 'Iterator', 'console', 'process', 'Buffer', 'URL', 'AbortSignal', 'AbortController']);

function typeParameter(identifier) {
  for (let node = identifier.parent; node; node = node.parent) {
    const parameter = node.typeParameters?.find(item => item.name.text === identifier.text);
    if (parameter) return parameter;
  }
  return null;
}

function declarationUnit(context, declaration) {
  for (let node = declaration; node; node = node.parent) if (context.byNode.has(node)) return context.byNode.get(node);
  return null;
}

function unitOwner(context, declaration, identity) {
  const unit = declarationUnit(context, declaration);
  if (!unit || !identity.has(unit)) return null;
  if (declaration === unit.node || (ts.isVariableDeclaration(declaration) && declaration.parent.parent === unit.node)) {
    return [identity.get(unit), declaration.name?.getText() ?? 'default', declarationKinds(unit.node)];
  }
  const index = unit.tokens.filter(token => token.start < declaration.getStart(unit.source.sourceFile)).length;
  return [identity.get(unit), ts.SyntaxKind[declaration.kind], index];
}

function importedOwner(context, unit, imported, identity) {
  if (!imported.specifier.startsWith('.')) return ['external', imported.specifier, imported.name, imported.typeOnly];
  if (imported.name === '*') return null;
  const result = forwarded(context, unit.path, imported, new Set());
  if (result.reasons.length || result.owners.length !== 1) return null;
  const owner = result.owners[0];
  return owner.unit && identity.has(owner.unit) ? [identity.get(owner.unit), owner.name, owner.kinds] : null;
}

export function bindingOwner(identifier, context, unit, identity) {
  const declaration = resolveBinding(identifier)?.declaration ?? typeParameter(identifier);
  if (declaration) {
    const imported = importBinding(declaration);
    return imported ? importedOwner(context, unit, imported, identity) : unitOwner(context, declaration, identity);
  }
  const type = moduleModel(context, unit.path).locals.get(identifier.text);
  if (type?.length === 1) return [identity.get(type[0].unit), type[0].name, type[0].kinds];
  return GLOBALS.has(identifier.text) ? ['global', identifier.text] : null;
}
