import { sourceReaderAnalysis } from './analyze.mjs';
import { lostDeclarations, declarationLossLiterals } from './declaration-loss.mjs';
import { readerCandidatePaths } from './reader-candidates.mjs';

function augmented(context, paths) {
  const observed = sourceReaderAnalysis(context.files, context.parsed, paths);
  const unverified = [...context.report.coverage.unverified, ...observed.unverified];
  return { ...context.report, findings: [...context.report.findings, ...observed.findings],
    coverage: { complete: unverified.length === 0, unverified },
    sourceReaders: { mode: 'diff-literal-candidates',
      unverifiedCount: observed.unverified.filter(item => item.kind === 'source-reader').length,
      analyzedPaths: paths.filter(path => context.parsed.has(path)) } };
}

/** Internal contexts carry ASTs; this returns JSON-only reports. */
export function readerComparison(head, base) {
  if (!base) return { current: head.report, previous: null };
  const lost = lostDeclarations(head.parsed, base.parsed);
  const paths = [...new Set([...readerCandidatePaths(head.parsed, lost), ...readerCandidatePaths(base.parsed, lost)])].sort();
  const current = augmented(head, paths);
  const previous = augmented(base, paths);
  current.sourceReaders.declarationLossLiterals = declarationLossLiterals(head.parsed, base.parsed);
  current.sourceReaders.baseAnalyzedPaths = previous.sourceReaders.analyzedPaths;
  current.sourceReaders.baseUnverifiedCount = previous.sourceReaders.unverifiedCount;
  return { current, previous };
}
