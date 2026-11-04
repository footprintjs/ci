import ts from 'typescript';
import { bindingUses } from '../bindings/uses.mjs';
import { hasExplicitWrite } from '../bindings/writes.mjs';
import { outerExpression, runtimeSyntax, onlyTypeof } from './runtime-position.mjs';

function exportedAlias(declaration) {
  if (declaration.parent.parent.modifiers?.some(item=>item.kind===ts.SyntaxKind.ExportKeyword)) return true;
  return declaration.getSourceFile().statements.some(node=>ts.isExportDeclaration(node)&&!node.moduleSpecifier
    &&node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.some(item=>
      (item.propertyName??item.name).text===declaration.name.text));
}

function finiteRead(reference, container) {
  if (!runtimeSyntax(reference) || onlyTypeof(reference)) return true;
  const outer=outerExpression(reference);
  const parent=outer.parent;
  if (!parent || parent.expression!==outer) return false;
  const key=ts.isPropertyAccessExpression(parent)?parent.name.text:
    ts.isElementAccessExpression(parent)&&parent.argumentExpression&&ts.isStringLiteralLike(parent.argumentExpression)
      ?parent.argumentExpression.text:null;
  const loaders=container==='module'?['require']:['require','eval','Function'];
  return key!==null&&!loaders.includes(key);
}

/** Same finite property policy as direct global access, with no alias escape or write. */
export function safeGlobalCapture(identifier) {
  const outer=outerExpression(identifier);
  const declaration=outer.parent;
  if (!declaration||!ts.isVariableDeclaration(declaration)||declaration.initializer!==outer
    ||!ts.isIdentifier(declaration.name)||!(declaration.parent.flags&ts.NodeFlags.Const)) return false;
  if (exportedAlias(declaration)||hasExplicitWrite(declaration)) return false;
  const uses=bindingUses(identifier.getSourceFile()).valueUses.get(declaration)??[];
  return uses.every(reference=>reference.getStart()>=declaration.getEnd()&&finiteRead(reference,identifier.text));
}
