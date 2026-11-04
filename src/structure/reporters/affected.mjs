export function affectedText(report) {
  return [`Affected test estimate: ${report.headId ?? 'snapshot'}`, `Base: ${report.baseId ?? 'snapshot'}`,
    `Selected tests: ${report.tests.length}`, ...report.tests,
    `Compiler required: ${report.compilerRequired ? 'yes' : 'no'}`,
    `Unverified: ${report.coverage.unverified.length}`,
    `Full suite required before merge: ${report.fullSuiteBeforeMerge ? 'yes' : 'no'}`, ''].join('\n');
}
