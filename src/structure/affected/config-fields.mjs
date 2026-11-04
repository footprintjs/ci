import ts from 'typescript';

export function configProperty(object, name) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  if (object.properties.some(item => ts.isSpreadAssignment(item) || (item.name && ts.isComputedPropertyName(item.name)))) return null;
  const found = object.properties.filter(item => item.name?.text === name);
  return found.length === 1 && ts.isPropertyAssignment(found[0]) ? found[0].initializer : null;
}

export function literalSetups(object) {
  const paths = [];
  for (const name of ['setupFiles', 'globalSetup']) {
    const fields = object?.properties?.filter(item => item.name?.text === name) ?? [];
    if (!fields.length) continue;
    const value = configProperty(object, name);
    if (!value) return { reason: 'Shared setup has duplicate or unsupported property syntax.' };
    if (ts.isStringLiteralLike(value)) paths.push(value.text);
    else if (ts.isArrayLiteralExpression(value) && value.elements.every(ts.isStringLiteralLike)) paths.push(...value.elements.map(item => item.text));
    else return { reason: 'Shared setup roots are not literal strings.' };
  }
  return { paths: [...new Set(paths)] };
}
