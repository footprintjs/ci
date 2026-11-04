export function summaryText(report) {
  const counts = new Map();
  for (const item of report.findings) counts.set(item.rule, (counts.get(item.rule) ?? 0) + 1);
  const rules = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([rule, count]) => `${rule}: ${count}`);
  return [`Structure report (advisory): ${report.id}`, `Base: ${report.baseId ?? 'none'}`,
    `Parser: TypeScript ${report.metadata.parserVersion}`, `Findings: ${report.findings.length}`,
    ...rules, `Unverified: ${report.coverage.unverified.length}`,
    'Limits are pinned in the checker. Findings do not decide a merge.', ''].join('\n');
}
