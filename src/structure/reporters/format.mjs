import { summaryText } from './text.mjs';
import { affectedText } from './affected.mjs';

export function formatReport(report, format = 'json') {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  return report.estimate === true ? affectedText(report) : summaryText(report);
}
