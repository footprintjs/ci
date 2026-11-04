import ts from 'typescript';
import { declarationKinds, declarationNames, importBinding } from './declarations.mjs';

function recordImport(node, model) {
  const clause = node.importClause;
  const named = clause?.namedBindings;
  const bindings = [...(clause?.name ? [clause] : []), ...(named ? ts.isNamedImports(named) ? named.elements : [named] : [])];
  for (const binding of bindings) model.imports.set(binding.name.text, importBinding(binding));
}

function recordExport(node, model) {
  const clause = node.exportClause;
  if (clause && !ts.isNamedExports(clause)) { model.opaque = true; return; }
  if (!clause) { model.stars.push({ specifier: node.moduleSpecifier?.text, typeOnly: node.isTypeOnly }); return; }
  for (const item of clause.elements) {
    const name = item.name.text;
    const entry = { name: (item.propertyName ?? item.name).text, specifier: node.moduleSpecifier?.text,
      typeOnly: Boolean(node.isTypeOnly || item.isTypeOnly) };
    model.exports.set(name, [...(model.exports.get(name) ?? []), entry]);
  }
}

function recordDeclaration(node, model, context) {
  const unit = context.byNode.get(node);
  for (const name of declarationNames(node)) model.locals.set(name, [...(model.locals.get(name) ?? []),
    { unit, name, kinds: declarationKinds(node) }]);
  const exported = node.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword);
  const defaulted = node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword);
  if (defaulted) model.exports.set('default', [{ direct: { unit, name: node.name?.text ?? 'default', kinds: declarationKinds(node) } }]);
  else if (exported) for (const name of declarationNames(node)) model.exports.set(name, [{ name }]);
  if (ts.isExportAssignment(node)) {
    if (node.isExportEquals) model.opaque = true;
    else model.exports.set('default', [ts.isIdentifier(node.expression) ? { name: node.expression.text }
      : { direct: { unit, name: 'default', kinds: ['value'] } }]);
  }
}

export function moduleModel(context, path) {
  context.models ??= new Map();
  if (context.models.has(path)) return context.models.get(path);
  const model = { locals: new Map(), imports: new Map(), exports: new Map(), stars: [], opaque: false };
  for (const node of context.parsed.get(path)?.sourceFile.statements ?? []) {
    if (ts.isImportDeclaration(node)) recordImport(node, model);
    else if (ts.isExportDeclaration(node)) recordExport(node, model);
    else if (ts.isImportEqualsDeclaration(node)) model.opaque = true;
    else recordDeclaration(node, model, context);
  }
  context.models.set(path, model);
  return model;
}
