import ts from 'typescript';
import { resolveImmutableValue } from '../bindings/immutable.mjs';
import { frameworkOrigin } from './methods.mjs';

/** Choice evidence is syntactic and belongs to this body, never a nested body. */
export function ownChoice(callable, required) {
  let found = false;
  const unverified = [];
  const visit = node => {
    if (ts.isFunctionLike(node) && node.body) return;
    if (ts.isCallExpression(node)) {
      const value = resolveImmutableValue(node.expression);
      if (['decide', 'select'].includes(value.origin?.name)) {
        if (!frameworkOrigin(value.origin)) unverified.push('Relative decision import ownership is unverified.');
        else if (required === 'either' || value.origin.name === required) found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(callable.body);
  return { found, unverified };
}
