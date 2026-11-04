import ts from 'typescript';
import { runtimeCallable, runtimeClass, unitIdentity } from './identity.mjs';
import { branchMetrics } from './branches.mjs';
import { jsxComponent } from './jsx.mjs';
import { countStatements } from './statements.mjs';

export function unitLocation(node, parsed) {
  const start = node.getStart(parsed.sourceFile);
  const end = node.getEnd();
  const line = parsed.sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  const endLine = parsed.sourceFile.getLineAndCharacterOfPosition(Math.max(start, end - 1)).line + 1;
  const codeLines = [...parsed.codeLineSet].filter(value => value >= line && value <= endLine).length;
  return { start, end, line, endLine, codeLines };
}

function callableMetric(node, parsed) {
  const parameters = node.parameters.filter(parameter => !(ts.isIdentifier(parameter.name) && parameter.name.text === 'this')).length;
  const initializers = node.parameters.map(parameter => parameter.initializer).filter(Boolean);
  return { ...unitIdentity(node, parsed), ...unitLocation(node, parsed),
    ...branchMetrics(node.body, initializers), parameters, jsx: jsxComponent(node),
    statementCount: countStatements(node) };
}

export function measureUnits(parsed) {
  const functions = [];
  const classes = [];
  const visit = node => {
    if (runtimeCallable(node)) functions.push(callableMetric(node, parsed));
    if (runtimeClass(node)) classes.push({ ...unitIdentity(node, parsed), ...unitLocation(node, parsed) });
    ts.forEachChild(node, visit);
  };
  visit(parsed.sourceFile);
  return { functions, classes };
}
