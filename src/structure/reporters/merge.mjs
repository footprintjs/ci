import { quoteText as quote } from './quote.mjs';

function details(items,field){
  return items.slice(0,20).map(item=>`${quote(item.path||'<tree>')}:${item.line??1} ${item[field]}: ${quote(item.reason??'<see JSON>')}`);
}

export function mergeText(report){
  return [`Merge replay observations: ${report.headId}`,`Parents: ${report.parents.join(', ')}`,
    `Git: ${quote(report.replay.gitVersion)}`,`Replay: ${report.replay.status} ${report.replay.tree??''}`,
    `Conflict paths: ${report.replay.conflictPaths.length}`,`Differences: ${report.differences.length}`,
    `Findings: ${report.findings.length}`,`Unverified: ${report.coverage.unverified.length}`,
    ...report.replay.conflictPaths.slice(0,20).map(path=>`Conflict: ${quote(path)}`),
    ...details(report.findings,'rule'),...details(report.coverage.unverified,'kind'),
    'Showing up to20 conflict paths, findings and uncertainty records each; JSON retains every observation.',
    'These observations support review; they do not decide a merge.',''].join('\n');
}
