function observation(item, pair) {
  return { ...item, baseUnitId: pair.base.unitId, matchKind: pair.matchKind };
}

function comparePair(pair, result) {
  for (const item of pair.head.findings) {
    const old = pair.base.byRule.get(item.rule);
    const current = observation(item, pair);
    if (!old) result.regressions.push({ ...current, reason: 'new-rule-debt' });
    else if (item.value > old.value || item.excess > old.excess) {
      result.regressions.push({ ...current, reason: 'grown-unit', previousValue: old.value });
    } else if (item.value < old.value || item.excess < old.excess) result.improved.push(current);
    else result.existing.push(current);
  }
  for (const old of pair.base.findings) {
    if (!pair.head.byRule.has(old.rule)) result.removed.push(observation(old, pair));
  }
}

export function profileObservations(matching) {
  const result = { regressions: [], existing: [], improved: [], removed: [] };
  for (const pair of matching.pairs) comparePair(pair, result);
  for (const unit of matching.unmatchedHead) {
    const reason = matching.ambiguous.includes(unit) ? 'ambiguous-unit' : 'new-unit';
    result.regressions.push(...unit.findings.map(item => ({ ...item, reason })));
  }
  for (const unit of matching.unmatchedBase) result.removed.push(...unit.findings);
  return result;
}
