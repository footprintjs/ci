import ts from 'typescript';
import { resolveBinding } from '../bindings/index.mjs';
import { importOrigin } from '../bindings/imports.mjs';
import { configProperty as property, hasConfigProperty as present, literalSetups } from './config-fields.mjs';

function configObject(source) {
  const exports = source.sourceFile.statements.filter(ts.isExportAssignment);
  if (exports.length !== 1 || exports[0].isExportEquals) return null;
  let value = exports[0].expression;
  while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value)) value = value.expression;
  if (ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
    const declaration = resolveBinding(value.expression)?.declaration;
    const origin = declaration && importOrigin(declaration);
    if (!origin || origin.module !== 'vitest/config' || origin.name !== 'defineConfig' || value.arguments.length !== 1) return null;
    value = value.arguments[0];
  }
  return ts.isObjectLiteralExpression(value) ? value : null;
}

function configPaths(parsed, prefix) {
  return [...parsed.keys()].filter(path => new RegExp(`^${prefix}\\.config\\.[cm]?[jt]s$`).test(path));
}

/** Read only the default finite literal include shape; no config is evaluated. */
export function runnerInclude(parsed) {
  const vitest = configPaths(parsed, 'vitest');
  const paths = vitest.length ? vitest : configPaths(parsed, 'vite');
  if (paths.length !== 1) return { paths, reason: 'A unique default literal Vitest config is unavailable.' };
  const source = parsed.get(paths[0]);
  const object = configObject(source);
  const test = property(object, 'test');
  const include = property(test, 'include');
  if (source.sourceFile.parseDiagnostics.length) return { paths, reason: 'Runner config has syntax diagnostics.' };
  if (present(object, 'root') || present(test, 'dir') || present(test, 'includeSource')) {
    return { paths, reason: 'Alternate source roots or inline test discovery are outside the admitted include grammar.' };
  }
  if (present(test, 'projects') || present(test, 'workspace') || [...parsed.keys()].some(path => /^vitest\.workspace\./.test(path))) {
    return { paths, reason: 'Project/workspace runner discovery is outside the admitted literal include grammar.' };
  }
  if (!include || !ts.isArrayLiteralExpression(include) || !include.elements.length
    || !include.elements.every(ts.isStringLiteralLike)) return { paths, reason: 'Runner test.include is not a nonempty plain literal string array.' };
  const setups = literalSetups(test);
  if (setups.reason) return { paths, reason: setups.reason };
  return { paths, include: include.elements.map(item => item.text), setups: setups.paths };
}
