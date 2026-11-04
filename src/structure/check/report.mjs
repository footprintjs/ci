import ts from 'typescript';
import { observeSnapshotContext } from './snapshot.mjs';
import { compareFindings } from '../ratchet/index.mjs';
import { LIMITS } from '../rules/limits.mjs';
import { declarationLossLiterals } from '../references/declaration-loss.mjs';

export function checkSnapshots(head, base) {
  const headContext = observeSnapshotContext(head);
  const baseContext = base ? observeSnapshotContext(base) : null;
  const current = headContext.report;
  const previous = baseContext?.report ?? null;
  const ratchet = previous ? compareFindings(current.findings, previous.findings) : null;
  const unverified = [...current.coverage.unverified,
    ...(previous?.coverage.unverified ?? []), ...(ratchet?.coverage.unverified ?? [])];
  return { ...current, status: 'advisory', baseId: previous?.id ?? null, ratchet,
    coverage: { complete: unverified.length === 0, unverified },
    sourceReaders: { ...current.sourceReaders,
      declarationLossLiterals: declarationLossLiterals(headContext.parsed, baseContext?.parsed) },
    metadata: { parserVersion: ts.version, ruleVersion: 'structure-1-report-only', limits: LIMITS,
      sourceScope: 'production src; tests and declaration files excluded from runtime graph',
      loadScope: 'static tracked-source estimate; external implementations are outside the tree',
      extractionCredit: 'unimplemented pending measured calibration',
      statementMetric: 'separate follow-up, not yet implemented' } };
}
