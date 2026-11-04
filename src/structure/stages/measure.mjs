import { overLimit } from '../rules/finding.mjs';
import { LIMITS } from '../rules/limits.mjs';
import { ownChoice } from './choice.mjs';

export function stageFindings({ source, unit, node, spec }) {
  const findings = [
    ...overLimit(source, unit, { rule: 'stage-lines', value: unit.codeLines, limit: LIMITS.stageLines }),
    ...overLimit(source, unit, { rule: 'stage-complexity', value: unit.complexity, limit: LIMITS.stageComplexity }),
  ];
  const choice = spec.choice ? ownChoice(node, spec.choice) : { found: true, unverified: [] };
  findings.push(...overLimit(source, unit, { rule: 'decider-choice', value: Number(!choice.found), limit: 0 }));
  return { findings, reasons: choice.unverified };
}
