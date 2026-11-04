import ts from 'typescript';
import { resolveRelative } from '../sources/paths.mjs';

function target(node){
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
    return {literal:node.arguments.length===1?node.arguments[0]:null,kind:'dynamic import'};
  }
  if(ts.isImportTypeNode(node))return {literal:!node.attributes&&ts.isLiteralTypeNode(node.argument)?node.argument.literal:null,kind:'import type'};
  return null;
}

/** A location-sensitive import needs a finite tracked relative owner. */
export function dynamicImportReasons(unit,context){
  const reasons=new Set();
  const visit=node=>{
    const entry=target(node);
    if(entry){
      const literal=entry.literal;
      const resolved=literal&&ts.isStringLiteralLike(literal)&&literal.text.startsWith('.')
        ?resolveRelative(unit.path,literal.text,context.files):null;
      if(!resolved?.path)reasons.add(`Moved ${entry.kind} has an opaque, external, attributed or unresolved target; location semantics are unproved.`);
    }
    ts.forEachChild(node,visit);
  };
  visit(unit.node);
  return [...reasons];
}
