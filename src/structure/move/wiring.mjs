import ts from 'typescript';
import { resolveBinding } from '../bindings/index.mjs';
import { isValueReference } from '../bindings/references.mjs';
import { importBinding } from './declarations.mjs';
import { documentationNames } from './documentation.mjs';
import { moduleModel } from './module.mjs';
import { unknown } from './notes.mjs';
import { forwarded } from './exports.mjs';

function referencedImports(context,path){
  const names=new Set();
  for(const unit of context.units.filter(item=>item.path===path)){
    for(const name of documentationNames(unit).names)names.add(name);
    const visit=node=>{
      if(ts.isIdentifier(node)&&isValueReference(node)){
        const declaration=resolveBinding(node)?.declaration;
        if(declaration&&importBinding(declaration))names.add(node.text);
      }
      ts.forEachChild(node,visit);
    };
    visit(unit.node);
  }
  return names;
}

function unchangedStatements(source){
  const counts=new Map();
  for(const node of source?.sourceFile.statements??[]){
    const text=node.getText(source.sourceFile);
    counts.set(text,(counts.get(text)??0)+1);
  }
  return counts;
}

function importNames(node){
  const clause=node.importClause;
  const named=clause?.namedBindings;
  return [...(clause?.name?[clause.name.text]:[]),...(named?ts.isNamedImports(named)?named.elements.map(item=>item.name.text):[named.name.text]:[])];
}

function formerOwnerImport(name,context,path){
  const entry=moduleModel(context,path).imports.get(name);
  if(!entry)return false;
  const resolved=forwarded(context,path,entry,new Set());
  return !resolved.reasons.length&&resolved.owners.length===1&&context.pairs.some(pair=>
    pair.base.path===path&&pair.head.path!==path&&pair.head===resolved.owners[0].unit);
}

function uncertainWiring(node,context,path,used){
  if(ts.isImportEqualsDeclaration(node))return true;
  if(ts.isImportDeclaration(node)){
    const names=importNames(node);
    return !names.length||names.some(name=>!used.has(name)&&!formerOwnerImport(name,context,path));
  }
  return ts.isExportDeclaration(node)&&(!context.originalPaths.has(path)||
    (node.exportClause&&ts.isNamedExports(node.exportClause)&&!node.exportClause.elements.length));
}

function attributeCoverage(context){
  return [...context.parsed].flatMap(([path,source])=>source.sourceFile.statements
    .filter(node=>(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.attributes)
    .map(()=>unknown('move-wiring-attributes',{path},'Import/export attributes need module metadata semantics outside the admitted wiring grammar.')));
}

export function wiringCoverage(base,head,pairs){
  const unverified=[...attributeCoverage(base),...attributeCoverage(head)];
  const context={...head,pairs,originalPaths:new Set(base.files.keys())};
  for(const [path,source]of head.parsed){
    const before=unchangedStatements(base.parsed.get(path));
    const used=referencedImports(head,path);
    for(const node of source.sourceFile.statements){
      const text=node.getText(source.sourceFile);
      if(before.get(text)){before.set(text,before.get(text)-1);continue;}
      if(uncertainWiring(node,context,path,used))unverified.push(unknown('move-wiring',{path},'New unused/opaque import or private reexport wiring has no whole-unit use proof.'));
    }
  }
  return unverified;
}
