import ts from 'typescript';

function declaredNames(name) {
  if (!name) return [];
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return [name.text];
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.flatMap(item => ts.isBindingElement(item) ? declaredNames(item.name) : []);
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return [name.expression.text];
  return [];
}

function declaration(node) {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)
    || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)
    || ts.isVariableDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
    || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isPropertyAssignment(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

export function declarationOwners(parsed) {
  const names = new Set();
  const unverified = [];
  const visit = (node, parentNames) => {
    const declared = ts.isConstructorDeclaration(node) ? ['constructor'] : declaration(node) ? declaredNames(node.name) : [];
    if (declaration(node) && node.name && ts.isComputedPropertyName(node.name) && !declared.length) {
      unverified.push({ kind: 'citation-owner', path: parsed.path, reason: 'Computed declaration name is unresolved.' });
    }
    for (const name of declared) names.add([...parentNames, name].join('.'));
    const nested = declared.length === 1 ? [...parentNames, declared[0]] : parentNames;
    ts.forEachChild(node, child => visit(child, nested));
  };
  visit(parsed.sourceFile, []);
  return { names, unverified };
}

export function symbolOwner(owners, symbol) {
  if (!owners) return 'missing';
  if (owners.names.has(symbol)) return 'present';
  const candidates = [...owners.names].filter(name => name.endsWith(`.${symbol}`));
  if (candidates.length === 1) return 'present';
  if (candidates.length > 1 || owners.unverified.length) return 'unverified';
  return 'missing';
}
