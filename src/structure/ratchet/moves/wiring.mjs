import { LIMITS } from '../../rules/limits.mjs';

const excess = value => Math.max(0, value - LIMITS.directImports);

function importCounts(context) {
  const counts = new Map();
  for (const edge of context.report.graph.edges) {
    if (!edge.unverified) counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
  }
  return counts;
}

export function wiringAllowances(headContext, baseContext) {
  const previousCode = new Map(baseContext.report.measurements.map(item => [item.path, item.codeLines]));
  const before = importCounts(baseContext);
  const after = importCounts(headContext);
  const result = new Map();
  for (const item of headContext.report.measurements) {
    if (!previousCode.has(item.path) || item.codeLines >= previousCode.get(item.path)) continue;
    const allowedGrowth = excess(after.get(item.path) ?? 0) - excess(before.get(item.path) ?? 0);
    if (allowedGrowth <= 0) continue;
    result.set(item.path, { previousCodeLines: previousCode.get(item.path), codeLines: item.codeLines,
      previousImports: before.get(item.path) ?? 0, imports: after.get(item.path) ?? 0, allowedGrowth });
  }
  return result;
}
