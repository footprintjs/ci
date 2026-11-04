import ts from 'typescript';
import { resolveRelative } from '../sources/paths.mjs';
import { inertUnit } from './inert.mjs';
import { unknown } from './notes.mjs';

function importTarget(node) {
  if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) return node.moduleSpecifier.text;
  if (ts.isExportDeclaration(node) && !node.isTypeOnly) return node.moduleSpecifier?.text;
  return null;
}

function loadSequence(context, path, identity, seen = new Set()) {
  if (seen.has(path)) return { order: [], reasons: ['Cyclic eager import order is unresolved.'] };
  const order = [];
  const reasons = [];
  for (const node of context.parsed.get(path)?.sourceFile.statements ?? []) {
    const specifier = importTarget(node);
    if (!specifier) continue;
    if (!specifier.startsWith('.')) { order.push(`external:${specifier}`); continue; }
    const target = resolveRelative(path, specifier, context.files);
    if (!target.path) { reasons.push(target.reason); continue; }
    const loaded = loadSequence(context, target.path, identity, new Set(seen).add(path));
    order.push(...loaded.order); reasons.push(...loaded.reasons);
  }
  for (const unit of context.units.filter(item => item.path === path && !inertUnit(item.node))) {
    order.push(identity.get(unit) ?? `unmatched:${path}:${unit.order}`);
  }
  return { order: [...new Set(order)], reasons };
}

export function importOrderCoverage(base, head, identity) {
  const unverified = [];
  for (const path of base.parsed.keys()) {
    if (!head.parsed.has(path)) continue;
    const before = loadSequence(base, path, identity);
    const after = loadSequence(head, path, identity);
    const reasons = [...before.reasons, ...after.reasons];
    if (JSON.stringify(before.order) !== JSON.stringify(after.order)) reasons.push('Eager load-bearing owner order changed.');
    for (const reason of reasons) unverified.push(unknown('load-order', { path }, reason));
  }
  return unverified;
}
