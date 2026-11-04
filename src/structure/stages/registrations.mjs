import ts from 'typescript';
import { resolveImmutableValue } from '../bindings/immutable.mjs';
import { resolveBinding } from '../bindings/index.mjs';
import { FACTORIES, METHODS, frameworkOrigin } from './methods.mjs';
import { receiverKind } from './receivers.mjs';

function bareCandidate(node) {
  if (!ts.isIdentifier(node)) return null;
  const declaration = resolveBinding(node)?.declaration;
  const name = ts.isImportSpecifier(declaration ?? node) ? (declaration.propertyName ?? declaration.name).text : node.text;
  return FACTORIES[name] ? 'A factory spelling has no admitted runtime import owner.' : null;
}

function computedCandidate(expression) {
  if (ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression) &&
      (METHODS[expression.argumentExpression.text] || FACTORIES[expression.argumentExpression.text])) {
    return true;
  }
  return false;
}

function memberRegistration(expression) {
  if (!ts.isPropertyAccessExpression(expression)) return { reason: bareCandidate(expression) };
  const method = expression.name.text;
  if (!METHODS[method] && !FACTORIES[method]) return {};
  const kind = receiverKind(expression.expression);
  if (kind === 'unrelated') return {};
  const spec = METHODS[method];
  return spec?.receivers.includes(kind) ? { method, spec }
    : { reason: 'Registration receiver is not an admitted builder or branch-list value.' };
}

export function registrationFor(call) {
  const callee = resolveImmutableValue(call.expression);
  if (callee.origin && FACTORIES[callee.origin.name]) {
    return frameworkOrigin(callee.origin) ? { method: callee.origin.name, spec: FACTORIES[callee.origin.name] }
      : { reason: 'Relative or non-framework factory import ownership is unverified.' };
  }
  if (callee.node && ts.isFunctionLike(callee.node) && callee.node.body) return {};
  if (computedCandidate(call.expression)) return { reason: 'Computed registration access is unsupported.' };
  return memberRegistration(call.expression);
}
