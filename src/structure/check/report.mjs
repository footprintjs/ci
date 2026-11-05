import ts from 'typescript';
import { snapshotContexts } from './snapshot.mjs';
import { compareFindings } from '../ratchet/index.mjs';
import { LIMITS } from '../rules/limits.mjs';
import { readerComparison } from '../references/reader-comparison.mjs';
import { headShapedBaseline } from './baseline.mjs';
import { movedFileEvidence, wiringAllowances } from '../ratchet/moves/index.mjs';

export function checkSnapshots(head, base) {
  const { headContext, baseContext } = snapshotContexts(head, base);
  const readers = readerComparison(headContext, baseContext);
  const current = readers.current;
  const previous = baseContext ? headShapedBaseline(headContext, baseContext, readers.previous) : null;
  const ratchet = previous ? compareFindings(current.findings, previous.findings,
    { movedFiles: movedFileEvidence(headContext, baseContext), wiring: wiringAllowances(headContext, baseContext) }) : null;
  const unverified = [...current.coverage.unverified,
    ...(previous?.coverage.unverified ?? []), ...(ratchet?.coverage.unverified ?? [])];
  return { ...current, status: 'advisory', baseId: previous?.id ?? null, ratchet,
    coverage: { complete: unverified.length === 0, unverified },
    metadata: { parserVersion: ts.version, ruleVersion: 'structure-1-report-only', limits: LIMITS,
      sourceScope: 'production src; tests and declaration files excluded from runtime graph',
      loadScope: 'static tracked-source estimate; external implementations are outside the tree',
      extractionCredit: 'whole top-level relocation only; partial extraction pending calibration',
      statementMetric: { status: 'counts-only', field: 'statementCount', body: 'Block only',
        excluded: ['Block', 'EmptyStatement'], nestedBodies: 'included', erasedDeclarations: 'included',
        headers: 'excluded', expressionBodies: 0, limit: null } } };
}
