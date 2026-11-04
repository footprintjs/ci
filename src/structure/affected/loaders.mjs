import ts from 'typescript';
import { hasLexicalBinding } from '../bindings/index.mjs';
import { isValueReference } from '../bindings/references.mjs';
import { makeRequest } from './requests.mjs';
import { unwrapExpression, outerExpression, runtimeSyntax, onlyTypeof } from './runtime-position.mjs';
import { safeGlobalCapture } from './global-metadata.mjs';

function globalName(node, name) {
  return ts.isIdentifier(node) && node.text === name && !hasLexicalBinding(node);
}

function objectLoader(expression) {
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false;
  const key = ts.isPropertyAccessExpression(expression) ? expression.name.text
    : expression.argumentExpression && ts.isStringLiteralLike(expression.argumentExpression) ? expression.argumentExpression.text : null;
  if (globalName(unwrapExpression(expression.expression), 'globalThis')) return key === null || ['require', 'eval', 'Function'].includes(key);
  return globalName(unwrapExpression(expression.expression), 'module') && (key === null || key === 'require');
}

function capturedContainer(node) {
  if (!['globalThis', 'module'].some(name => globalName(node, name)) || !isValueReference(node)) return false;
  const outer = outerExpression(node);
  const member = ts.isPropertyAccessExpression(outer.parent) || ts.isElementAccessExpression(outer.parent);
  return (!member || outer.parent.expression !== outer) && !safeGlobalCapture(node);
}

function unsupported(node) {
  if (onlyTypeof(node)) return null;
  if (globalName(node, 'require') && isValueReference(node)
    && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) return 'Aliased require is outside the admitted direct-loader grammar.';
  if (['eval', 'Function'].some(name => globalName(node, name)) && isValueReference(node)) return 'Reflective source evaluation has no static dependency closure.';
  if (objectLoader(node)) return 'Global-object loader ownership is unresolved.';
  if (capturedContainer(node)) return 'A captured global loader container has no static dependency closure.';
  return null;
}

export function loadingRequests(source, context) {
  const requests = [];
  const unverified = [];
  const visit = node => {
    if (!runtimeSyntax(node)) return;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || globalName(node.expression, 'require'))) {
      requests.push(makeRequest(source, node, {
        specifier: node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : null,
        names: ['*'], dynamic: true }, context));
    }
    const reason = unsupported(node);
    if (reason) unverified.push({ kind: 'affected-loading', path: source.path,
      line: source.sourceFile.getLineAndCharacterOfPosition(node.getStart(source.sourceFile)).line + 1, reason });
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return { requests, unverified };
}
