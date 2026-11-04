const movedRules = new Set(['file-code-lines', 'file-physical-lines', 'direct-imports',
  'function-lines', 'complexity', 'nesting', 'parameters', 'class-lines',
  'facade-lines', 'facade-complexity', 'facade-runtime', 'stage-lines', 'stage-complexity']);

function adjustedTotals(totals, wiring) {
  const allowedGrowth = [...wiring.values()].reduce((sum, item) => sum + item.allowedGrowth, 0);
  return totals.map(item => item.rule !== 'direct-imports' || !allowedGrowth ? item : {
    ...item, allowedGrowth, effectiveDelta: item.delta - allowedGrowth,
    regressed: item.delta > allowedGrowth,
  });
}

export function applyAllowances(observations, totals, { movedFiles = new Map(), wiring = new Map() } = {}) {
  const adjusted = adjustedTotals(totals, wiring);
  const byRule = new Map(adjusted.map(item => [item.rule, item]));
  const regressions = [];
  const credited = new Set();
  for (const item of observations.regressions) {
    if (item.rule === 'direct-imports' && wiring.has(item.path)) {
      observations.existing.push({ ...item, matchKind: 'split-wiring', reason: 'code-shrank', ...wiring.get(item.path) });
      credited.add(item.unitId);
    } else if (movedRules.has(item.rule) && movedFiles.has(item.path)
      && (byRule.get(item.rule)?.delta ?? 0) < 0) {
      observations.existing.push({ ...item, matchKind: 'moved', reason: 'whole-units-relocated',
        sourceUnits: movedFiles.get(item.path) });
      credited.add(item.unitId);
    } else regressions.push(item);
  }
  observations.regressions = regressions;
  return { totals: adjusted, credited };
}
