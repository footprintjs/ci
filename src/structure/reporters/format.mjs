import { summaryText } from './text.mjs';

export function formatReport(report, format = 'json') {
  return format === 'json' ? JSON.stringify(report, null, 2) + '\n' : summaryText(report);
}
