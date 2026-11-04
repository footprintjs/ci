import ts from 'typescript';
import { resolveRelative } from '../sources/paths.mjs';
import { inertUnit } from './inert.mjs';
import { unknown } from './notes.mjs';

function importTarget(node) {
  if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) return node.moduleSpecifier.text;
  if (ts.isExportDeclaration(node) && !node.isTypeOnly) return node.moduleSpecifier?.text;
  return null;
}

function loadModel(context, identity) {
  const units = new Map();
  for (const unit of context.units) {
    if (inertUnit(unit.node)) continue;
    if (!units.has(unit.path)) units.set(unit.path, []);
    units.get(unit.path).push(identity.get(unit) ?? `unmatched:${unit.path}:${unit.order}`);
  }
  return { context, units };
}

function visit(model, path, state) {
  if (state.active.has(path)) { state.reasons.push('Cyclic eager import order is unresolved.'); return; }
  if (state.completed.has(path)) return;
  state.active.add(path);
  for (const node of model.context.parsed.get(path)?.sourceFile.statements ?? []) {
    const specifier = importTarget(node);
    if (!specifier) continue;
    if (!specifier.startsWith('.')) { state.order.push(`external:${specifier}`); continue; }
    const target = resolveRelative(path, specifier, model.context.files);
    if (!target.path) { state.reasons.push(target.reason); continue; }
    visit(model, target.path, state);
  }
  state.order.push(...(model.units.get(path) ?? []));
  state.active.delete(path);
  state.completed.add(path);
}

function loadSequence(model, path) {
  const state = { active: new Set(), completed: new Set(), order: [], reasons: [] };
  visit(model, path, state);
  return { order: [...new Set(state.order)], reasons: state.reasons };
}

export function importOrderCoverage(base, head, identity) {
  const unverified = [];
  const oldModel = loadModel(base, identity), newModel = loadModel(head, identity);
  for (const path of base.parsed.keys()) {
    if (!head.parsed.has(path)) continue;
    const before = loadSequence(oldModel, path);
    const after = loadSequence(newModel, path);
    const reasons = [...before.reasons, ...after.reasons];
    if (JSON.stringify(before.order) !== JSON.stringify(after.order)) reasons.push('Eager load-bearing owner order changed.');
    for (const reason of reasons) unverified.push(unknown('load-order', { path }, reason));
  }
  return unverified;
}
