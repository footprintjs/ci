import ts from 'typescript';
import { LIMITS } from '../rules/limits.mjs';
import { overLimit } from '../rules/finding.mjs';
import { tokenHash, tokensBetween } from '../syntax/tokens.mjs';

function typeDeclaration(node) {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
    || Boolean(node.modifiers?.some(item => item.kind === ts.SyntaxKind.DeclareKeyword));
}

function headerExecution(expression) {
  let found = false;
  const visit = node => {
    if (ts.isFunctionLike(node) && node.body) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isAwaitExpression(node)
      || ts.isYieldExpression(node) || ts.isConditionalExpression(node)) found = true;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function computedHeader(member) {
  if (!member.name || !ts.isComputedPropertyName(member.name)) return null;
  const expression = member.name.expression;
  return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) ? null : expression;
}

function baseExpressions(node) {
  return (node.heritageClauses ?? []).filter(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap(clause => clause.types.map(type => type.expression));
}

function simpleBase(expression) {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isNonNullExpression(expression) || ts.isSatisfiesExpression(expression)) expression = expression.expression;
  return ts.isIdentifier(expression) || ts.isPropertyAccessExpression(expression);
}

function classEffects(node) {
  const effects = node.members.filter(member => ts.isClassStaticBlockDeclaration(member)
    || (ts.isPropertyDeclaration(member) && member.initializer));
  effects.push(...(ts.getDecorators(node) ?? []));
  effects.push(...baseExpressions(node).filter(headerExecution));
  for (const member of node.members) {
    effects.push(...(ts.getDecorators(member) ?? []));
    const computed = computedHeader(member);
    if (computed && headerExecution(computed)) effects.push(computed);
  }
  return effects;
}

function headerUncertainty(parsed) {
  return parsed.sourceFile.statements.filter(ts.isClassDeclaration).flatMap(node => {
    const computed = node.members.map(computedHeader).filter(Boolean).filter(expression => !headerExecution(expression));
    const opaqueBases = baseExpressions(node).filter(expression => !simpleBase(expression) && !headerExecution(expression));
    return [...computed, ...opaqueBases].map(expression => ({ kind: 'facade-header', path: parsed.path,
      line: parsed.sourceFile.getLineAndCharacterOfPosition(expression.getStart(parsed.sourceFile)).line + 1,
      reason: 'Computed class header needs value provenance outside the admitted facade grammar.' }));
  });
}

function runtimeStatements(parsed) {
  return parsed.sourceFile.statements.flatMap(node => {
    if (typeDeclaration(node) || ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)
      || ts.isExportDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isEmptyStatement(node)) return [];
    if (ts.isClassDeclaration(node)) return classEffects(node);
    if (ts.isExportAssignment(node) && (ts.isIdentifier(node.expression)
      || ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression))) return [];
    if (ts.isVariableStatement(node) && node.declarationList.declarations.every(declaration =>
      declaration.initializer && (ts.isArrowFunction(declaration.initializer)
        || ts.isFunctionExpression(declaration.initializer)))) return [];
    return [node];
  });
}

export function facadeAnalysis(parsed, measurement) {
  const findings = measurement.functions.flatMap(unit => [
    ...overLimit(measurement, unit, { rule: 'facade-lines', value: unit.codeLines, limit: LIMITS.facadeLines }),
    ...overLimit(measurement, unit, { rule: 'facade-complexity', value: unit.complexity, limit: LIMITS.facadeComplexity }),
  ]);
  for (const node of runtimeStatements(parsed)) {
    const start = node.getStart(parsed.sourceFile);
    const line = parsed.sourceFile.getLineAndCharacterOfPosition(start).line + 1;
    const bodyHash = tokenHash(tokensBetween(parsed, start, node.getEnd()));
    findings.push(...overLimit(measurement, { start, line, kind: 'statement', bodyHash,
      identity: `facade-effect:${bodyHash}`, name: node.name?.getText() ?? 'facade initialization' },
    { rule: 'facade-runtime', value: 1, limit: 0 }));
  }
  return { findings, unverified: headerUncertainty(parsed) };
}
