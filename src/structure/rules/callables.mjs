import { LIMITS } from './limits.mjs';
import { overLimit } from './finding.mjs';

export function callableFindings(source) {
  return source.functions.flatMap(unit => [
    ...overLimit(source, unit, { rule: 'function-lines', value: unit.codeLines, limit: unit.jsx ? LIMITS.jsxLines : LIMITS.functionLines }),
    ...overLimit(source, unit, { rule: 'complexity', value: unit.complexity, limit: LIMITS.complexity }),
    ...overLimit(source, unit, { rule: 'nesting', value: unit.depth, limit: LIMITS.depth }),
    ...overLimit(source, unit, { rule: 'parameters', value: unit.parameters, limit: LIMITS.parameters }),
  ]);
}
