import ts from 'typescript';
import { patternBindings } from '../bindings/patterns.mjs';

function runtimeNames(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || (ts.isFunctionDeclaration(node) && !node.body)) return [];
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(item => patternBindings(item.name, item).map(binding => binding.name));
  return node.name?.text ? [node.name.text] : [];
}

export function erasedCompanions(sourceFile) {
  const statements = [...sourceFile.statements];
  const values = new Set(statements.flatMap(runtimeNames));
  const implementations = new Set(statements.filter(node => ts.isFunctionDeclaration(node) && node.body).map(node => node.name?.text));
  return new Set(statements.filter(node => {
    if (ts.isFunctionDeclaration(node) && !node.body) return implementations.has(node.name?.text);
    return (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && values.has(node.name.text);
  }));
}
