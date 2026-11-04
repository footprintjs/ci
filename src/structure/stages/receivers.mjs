import ts from 'typescript';
import { resolveImmutableValue } from '../bindings/immutable.mjs';
import { FACTORIES, frameworkOrigin, nextReceiver } from './methods.mjs';

function callReceiver(node, seen) {
  const callee = resolveImmutableValue(node.expression);
  if (frameworkOrigin(callee.origin) && FACTORIES[callee.origin.name]) return FACTORIES[callee.origin.name].returns;
  if (!ts.isPropertyAccessExpression(node.expression)) return 'unknown';
  const kind = receiverKind(node.expression.expression, seen);
  if (kind === 'unrelated' || kind === 'unknown') return kind;
  return nextReceiver(node.expression.name.text, kind);
}

export function receiverKind(expression, seen = new Set()) {
  const value = resolveImmutableValue(expression);
  if (value.status !== 'resolved' || !value.node) return 'unknown';
  const node = value.node;
  if (seen.has(node)) return 'unknown';
  const next = new Set(seen).add(node);
  if (ts.isCallExpression(node)) return callReceiver(node, next);
  if (ts.isNewExpression(node)) {
    const constructor = resolveImmutableValue(node.expression);
    return frameworkOrigin(constructor.origin) && constructor.origin.name === 'FlowChartBuilder' ? 'builder' : 'unknown';
  }
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) || ts.isFunctionLike(node) ||
      ts.isClassLike(node) || ts.isLiteralExpression(node)) return 'unrelated';
  return 'unknown';
}
