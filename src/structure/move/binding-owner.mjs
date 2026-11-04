import ts from 'typescript';
import { resolveBinding, hasLexicalBinding } from '../bindings/index.mjs';
import { moduleModel } from './module.mjs';
import { importBinding, declarationKinds } from './declarations.mjs';
import { forwarded } from './exports.mjs';
import { tokenPrefixCount } from './token-position.mjs';

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

function typeNamePosition(identifier){
  for(let node=identifier.parent;node;node=node.parent){
    if(ts.isTypeQueryNode(node))return false;
    if(ts.isExpressionWithTypeArguments(node)&&ts.isHeritageClause(node.parent)){
      return node.parent.token!==ts.SyntaxKind.ExtendsKeyword||!ts.isClassLike(node.parent.parent);
    }
    if(ts.isTypeNode(node))return true;
    if(ts.isExpression(node)||ts.isStatement(node))return false;
  }
  return false;
}

function declarationUnit(context, declaration) {
  for (let node = declaration; node; node = node.parent) if (context.byNode.has(node)) return context.byNode.get(node);
  return null;
}

function topBindingName(declaration,unit){
  if(declaration===unit.node)return declaration.name?.getText()??'default';
  for(let node=declaration;node&&node!==unit.node;node=node.parent){
    if(ts.isFunctionLike(node))return null;
    if(ts.isVariableDeclaration(node)&&node.parent.parent===unit.node)return declaration.name?.getText()??null;
  }
  return null;
}

function unitOwner(context, declaration, identity) {
  const unit = declarationUnit(context, declaration);
  if (!unit || !identity.has(unit)) return null;
  const topName=topBindingName(declaration,unit);
  if(topName)return [identity.get(unit),topName,declarationKinds(unit.node)];
  const index = tokenPrefixCount(unit.tokens,declaration.getStart(unit.source.sourceFile),'start');
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
  const typeImport=identifier.parent;
  if(ts.isImportTypeNode(typeImport)&&typeImport.qualifier===identifier&&ts.isLiteralTypeNode(typeImport.argument)
    &&ts.isStringLiteralLike(typeImport.argument.literal))return importedOwner(context,unit,
    {specifier:typeImport.argument.literal.text,name:identifier.text,typeOnly:!typeImport.isTypeOf},identity);
  const parameter=typeNamePosition(identifier)?typeParameter(identifier):null;
  const declaration = parameter??resolveBinding(identifier)?.declaration;
  if (declaration) {
    const imported = importBinding(declaration);
    return imported ? importedOwner(context, unit, imported, identity) : unitOwner(context, declaration, identity);
  }
  if (hasLexicalBinding(identifier)) return null;
  return namedBindingOwner(identifier.text, context, unit, identity);
}

export function namedBindingOwner(name, context, unit, identity) {
  const model=moduleModel(context,unit.path);
  if(model.imports.has(name))return importedOwner(context,unit,model.imports.get(name),identity);
  const parameter=unit.node.typeParameters?.find(item=>item.name.text===name);
  if(parameter)return unitOwner(context,parameter,identity);
  const type = model.locals.get(name);
  if (type?.length === 1) return [identity.get(type[0].unit), type[0].name, type[0].kinds];
  if(type?.length)return null;
  return GLOBALS.has(name) ? ['global', name] : null;
}
