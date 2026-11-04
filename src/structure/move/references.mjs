import { referenceAnalysis, sourceReaderAnalysis } from '../references/analyze.mjs';
import { lostDeclarations, declarationLossLiterals } from '../references/declaration-loss.mjs';
import { readerCandidatePaths } from '../references/reader-candidates.mjs';

function citingPath(item,pairs){
  const offset=Number(item.unitId?.slice(item.path.length+1).split(':')[0]);
  const owners=pairs.filter(pair=>pair.head.path===item.path&&pair.head.comments.some(comment=>
    comment.offset<=offset&&comment.offset+comment.text.length>offset));
  return owners.length===1?owners[0].base.path:item.path;
}

function newlyObserved(current, previous, pairs) {
  const counts = new Map();
  const key = (item,path=item.path) => JSON.stringify([path, item.identity]);
  for (const item of previous) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return current.filter(item => {
    const identity=key(item,citingPath(item,pairs));
    const count = counts.get(identity) ?? 0;
    if (!count) return true;
    counts.set(identity, count - 1);
    return false;
  });
}

export function movedReferences(base, head, pairs) {
  const citations = referenceAnalysis(head.files, head.parsed);
  const previous = referenceAnalysis(base.files, base.parsed);
  const findings = newlyObserved(citations.findings, previous.findings,pairs);
  const lost = lostDeclarations(head.parsed, base.parsed);
  const paths = readerCandidatePaths(head.parsed, lost);
  const readers = sourceReaderAnalysis(head.files, head.parsed, paths);
  return { findings: [...findings, ...readers.findings],
    unverified: [...citations.unverified, ...readers.unverified],
    referenceScope: { mode: 'new-citation-findings', preExistingFindings: citations.findings.length - findings.length },
    sourceReaders: { unverifiedCount: readers.unverified.filter(item => item.kind === 'source-reader').length,
      analyzedPaths: paths, declarationLossLiterals: declarationLossLiterals(head.parsed, base.parsed) } };
}
