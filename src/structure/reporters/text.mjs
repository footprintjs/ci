export function summaryText(report) {
  const comparison = report.ratchet;
  const lead = comparison ? `Regressions: ${comparison.regressions.length}` : 'Inventory: no comparison';
  const compared = comparison ? [`Compared findings: existing ${comparison.existing.length}, improved ${comparison.improved.length}, removed ${comparison.removed.length}`] : [];
  const counts = new Map();
  for (const item of report.findings) counts.set(item.rule, (counts.get(item.rule) ?? 0) + 1);
  const rules = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([rule, count]) => `${rule}: ${count}`);
  return [lead, `Structure report (advisory): ${report.id}`, `Base: ${report.baseId ?? 'none'}`,
    `Parser: TypeScript ${report.metadata.parserVersion}`, `Current findings (all rules): ${report.findings.length}`,
    ...compared, ...rules, `Unverified: ${report.coverage.unverified.length}`,
    'Limits are pinned in the checker. Findings do not decide a merge.', ''].join('\n');
}
