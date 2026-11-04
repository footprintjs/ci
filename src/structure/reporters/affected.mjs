function quoted(value) {
  return JSON.stringify(String(value)).replace(/[\u007f-\u009f\u2028\u2029]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function affectedText(report) {
  return [`Affected test estimate: ${report.headId ?? 'snapshot'}`, `Base: ${report.baseId ?? 'snapshot'}`,
    `Selected tests: ${report.tests.length}`, ...report.tests.map(quoted),
    `Compiler required: ${report.compilerRequired ? 'yes' : 'no'}`,
    `Unverified: ${report.coverage.unverified.length}`,
    `Full suite required before merge: ${report.fullSuiteBeforeMerge ? 'yes' : 'no'}`, ''].join('\n');
}
