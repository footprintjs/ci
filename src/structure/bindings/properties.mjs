import ts from 'typescript';

/** Finite literal fields: no spread, accessor, computed-key or duplicate guesses. */
export function literalProperties(node) {
  const properties = new Map();
  const unverified = [];
  for (const item of node.properties) {
    if (ts.isSpreadAssignment(item) || !item.name || ts.isComputedPropertyName(item.name)) {
      unverified.push('Spread or computed literal field.');
      continue;
    }
    const name = item.name.text;
    if (properties.has(name)) unverified.push('Duplicate literal field.');
    if (ts.isPropertyAssignment(item)) properties.set(name, item.initializer);
    else if (ts.isShorthandPropertyAssignment(item)) properties.set(name, item.name);
    else if (ts.isMethodDeclaration(item)) properties.set(name, item);
    else unverified.push('Accessor or unsupported literal field.');
  }
  return { properties, unverified };
}
