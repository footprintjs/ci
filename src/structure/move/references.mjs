import { referenceAnalysis, sourceReaderAnalysis } from '../references/analyze.mjs';
import { lostDeclarations, declarationLossLiterals } from '../references/declaration-loss.mjs';
import { readerCandidatePaths } from '../references/reader-candidates.mjs';

function newlyObserved(current, previous) {
  const counts = new Map();
  const key = item => JSON.stringify([item.path, item.identity]);
  for (const item of previous) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return current.filter(item => {
    const count = counts.get(key(item)) ?? 0;
    if (!count) return true;
    counts.set(key(item), count - 1);
    return false;
  });
}

export function movedReferences(base, head) {
  const citations = referenceAnalysis(head.files, head.parsed);
  const previous = referenceAnalysis(base.files, base.parsed);
  const findings = newlyObserved(citations.findings, previous.findings);
  const lost = lostDeclarations(head.parsed, base.parsed);
  const paths = readerCandidatePaths(head.parsed, lost);
  const readers = sourceReaderAnalysis(head.files, head.parsed, paths);
  return { findings: [...findings, ...readers.findings],
    unverified: [...citations.unverified, ...readers.unverified],
    referenceScope: { mode: 'new-citation-findings', preExistingFindings: citations.findings.length - findings.length },
    sourceReaders: { unverifiedCount: readers.unverified.filter(item => item.kind === 'source-reader').length,
      analyzedPaths: paths, declarationLossLiterals: declarationLossLiterals(head.parsed, base.parsed) } };
}
