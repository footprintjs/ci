import { summaryText } from './text.mjs';
import { affectedText } from './affected.mjs';
import { moveText } from './move.mjs';

export function formatReport(report, format = 'json') {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  if (report.verification === 'move') return moveText(report);
  return report.estimate === true ? affectedText(report) : summaryText(report);
}
