import ts from 'typescript';
import { isValueReference } from '../bindings/references.mjs';
import { bindingOwner } from './binding-owner.mjs';
import { issue, unknown } from './notes.mjs';

function references(unit, context, identity) {
  const found = [];
  const visit = node => {
    if (ts.isIdentifier(node) && isValueReference(node)) found.push({ name: node.text,
      owner: bindingOwner(node, context, unit, identity) });
    ts.forEachChild(node, visit);
  };
  visit(unit.node);
  return found;
}

export function bindingChanges(pairs, base, head) {
  const identity = new Map(pairs.flatMap(pair => [[pair.base, `${pair.base.path}:${pair.base.order}`],
    [pair.head, `${pair.base.path}:${pair.base.order}`]]));
  const findings = [];
  const unverified = [];
  for (const pair of pairs) {
    const before = references(pair.base, base, identity);
    const after = references(pair.head, head, identity);
    if ([...before, ...after].some(item => !item.owner)) {
      unverified.push(unknown('move-binding', pair.head, 'A free name cannot be bound to the same declaration by the admitted lexical grammar.'));
    } else if (JSON.stringify(before) !== JSON.stringify(after)) findings.push(issue('move-imports', pair.head, 'Import or free-name declaration ownership changed.'));
  }
  return { findings, unverified, identity };
}
