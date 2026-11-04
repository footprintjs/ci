import ts from 'typescript';
import { resolveImmutableValue } from '../bindings/immutable.mjs';
import { literalProperties } from '../bindings/properties.mjs';
import { hasLexicalBinding } from '../bindings/index.mjs';

function absentCallback(node) {
  return ts.isIdentifier(node) && node.text === 'undefined' && !hasLexicalBinding(node);
}

function handlerCallbacks(node, collect) {
  const fields = literalProperties(node);
  const result = { nodes: [], reasons: [...fields.unverified] };
  for (const name of ['execute', 'resume']) {
    if (!fields.properties.has(name)) result.reasons.push(`Missing handler ${name} callback.`);
    else {
      const callback = collect(fields.properties.get(name), 'callback');
      result.nodes.push(...callback.nodes);
      result.reasons.push(...callback.reasons);
    }
  }
  return result;
}

function listCallbacks(node, collect) {
  const result = { nodes: [], reasons: [] };
  for (const element of node.elements) {
    const value = resolveImmutableValue(element);
    if (!value.node || !ts.isObjectLiteralExpression(value.node)) {
      result.reasons.push('Unresolved or spread branch-list entry.');
      continue;
    }
    const fields = literalProperties(value.node);
    result.reasons.push(...fields.unverified);
    if (!fields.properties.has('fn')) continue;
    if (absentCallback(fields.properties.get('fn'))) continue;
    const callback = collect(fields.properties.get('fn'), 'callback');
    result.nodes.push(...callback.nodes);
    result.reasons.push(...callback.reasons);
  }
  return result;
}

export function collectCallbacks(expression, mode) {
  const value = resolveImmutableValue(expression);
  if (value.status !== 'resolved' || !value.node) return { nodes: [], reasons: [value.reason ?? 'Imported callback body is unavailable.'] };
  const node = value.node;
  if (ts.isFunctionLike(node) && node.body && (mode === 'callback' || mode === 'root')) return { nodes: [node], reasons: [] };
  if (ts.isObjectLiteralExpression(node) && (mode === 'handler' || mode === 'root')) return handlerCallbacks(node, collectCallbacks);
  if (ts.isArrayLiteralExpression(node) && mode === 'list') return listCallbacks(node, collectCallbacks);
  return { nodes: [], reasons: ['Callback or handler is outside the admitted immutable literal grammar.'] };
}
