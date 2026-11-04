import ts from 'typescript';
import { runtimeCallable } from './identity.mjs';

const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);

function controlDepth(node) {
  return ts.isIfStatement(node) || ts.isIterationStatement(node, false)
    || ts.isSwitchStatement(node) || ts.isTryStatement(node) || ts.isConditionalExpression(node);
}

function decision(node) {
  return ts.isIfStatement(node) || ts.isIterationStatement(node, false)
    || ts.isCaseClause(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node)
    || (ts.isBinaryExpression(node) && LOGICAL.has(node.operatorToken.kind));
}

export function branchMetrics(body, initializers = []) {
  let complexity = 1;
  let maximum = 0;
  const visit = (node, depth) => {
    if (runtimeCallable(node)) return;
    if (decision(node)) complexity += 1;
    const nested = depth + Number(controlDepth(node));
    maximum = Math.max(maximum, nested);
    ts.forEachChild(node, child => {
      const elseIf = ts.isIfStatement(node) && child === node.elseStatement && ts.isIfStatement(child);
      visit(child, elseIf ? depth : nested);
    });
  };
  visit(body, 0);
  for (const initializer of initializers) visit(initializer, 0);
  return { complexity, depth: maximum };
}
