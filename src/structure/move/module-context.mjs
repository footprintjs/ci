import ts from 'typescript';
import { hasLexicalBinding } from '../bindings/index.mjs';
import { isValueReference } from '../bindings/references.mjs';

const MODULE_NAMES=new Set(['__filename','__dirname','module','exports','require']);

function ownContext(node,unit,name){
  for(let child=node,owner=node.parent;owner&&owner!==unit.node.parent;child=owner,owner=owner.parent){
    if(ts.isFunctionLike(owner)&&!ts.isArrowFunction(owner)&&child!==owner.name&&!ts.isDecorator(child))return true;
    if(name==='this'&&ts.isPropertyDeclaration(owner)&&child===owner.initializer)return true;
    if(name==='this'&&ts.isClassStaticBlockDeclaration(owner))return true;
  }
  return false;
}

function captured(node,unit){
  if(ts.isMetaProperty(node)){
    if(node.keywordToken===ts.SyntaxKind.ImportKeyword)return 'import.meta';
    if(!ownContext(node,unit,'new.target'))return 'lexical new.target';
  }
  if(node.kind===ts.SyntaxKind.ThisKeyword&&!ownContext(node,unit,'this'))return 'lexical this';
  if(!ts.isIdentifier(node)||!isValueReference(node)||hasLexicalBinding(node))return null;
  if(node.text==='arguments'&&!ownContext(node,unit,'arguments'))return 'lexical arguments';
  return MODULE_NAMES.has(node.text)?`implicit ${node.text}`:null;
}

export function moduleCaptures(unit){
  const captures=new Set();
  const visit=node=>{const context=captured(node,unit);if(context)captures.add(context);ts.forEachChild(node,visit);};
  visit(unit.node);
  return [...captures].sort();
}
