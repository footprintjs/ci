function sumRules(profiles) {
  const sums = new Map();
  for (const profile of profiles) {
    for (const item of profile.findings) sums.set(item.rule, (sums.get(item.rule) ?? 0) + item.excess);
  }
  return sums;
}

export function ruleTotals(head, base) {
  const current = sumRules(head);
  const previous = sumRules(base);
  return [...new Set([...current.keys(), ...previous.keys()])].sort().map(rule => {
    const headExcess = current.get(rule) ?? 0;
    const baseExcess = previous.get(rule) ?? 0;
    return { rule, baseExcess, headExcess, delta: headExcess - baseExcess, regressed: headExcess > baseExcess };
  });
}

export function totalRegressions({ totals, observations, head }) {
  return totals.filter(total => total.regressed &&
    !observations.regressions.some(item => item.rule === total.rule)).map(total => {
    const item = head.flatMap(unit => unit.findings).find(finding => finding.rule === total.rule);
    return { ...item, scope: 'rule-total', reason: 'total-excess', value: total.headExcess,
      limit: total.baseExcess, excess: total.delta };
  });
}
