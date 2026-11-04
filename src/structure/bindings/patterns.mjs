import ts from 'typescript';

/** Binding leaves, not property keys or identifiers used by default expressions. */
export function patternBindings(name, declaration) {
  if (ts.isIdentifier(name)) return [{ name: name.text, declaration }];
  if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) return [];
  return name.elements.flatMap(element => ts.isBindingElement(element)
    ? patternBindings(element.name, element) : []);
}
