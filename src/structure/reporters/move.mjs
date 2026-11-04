import { quoteText as quote } from './quote.mjs';

function details(items, field) {
  return items.slice(0, 20).map(item => `${quote(item.path ?? '<tree>')}:${item.line ?? 1} ${item[field]}: ${quote(item.reason ?? item.name ?? '<see JSON>')}`);
}

export function moveText(report) {
  const moves = report.moves.map(unit => `${quote(unit.name ?? '<anonymous>')}: ${quote(unit.from.path)}:${unit.from.line} -> ${quote(unit.to.path)}:${unit.to.line}`);
  return [`Move verification observations: ${report.headId ?? 'snapshot'}`, `Base: ${report.baseId ?? 'snapshot'}`,
    `Whole-unit moves: ${report.moves.length}`, `Findings: ${report.findings.length}`,
    `Unverified: ${report.coverage.unverified.length}`, `Ancillary changes: ${report.ancillaryChanges.length}`,
    `Relevant source-reader unknowns: ${report.sourceReaders?.unverifiedCount ?? 'unavailable'}`,
    ...moves, ...details(report.findings, 'rule'), ...details(report.coverage.unverified, 'kind'),
    'Showing up to 20 findings and 20 uncertainty records; JSON retains every observation.',
    'These observations support review; they do not decide a merge.', ''].join('\n');
}
