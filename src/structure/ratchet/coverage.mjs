export function matchingCoverage({ matching, base }) {
  const unverified = matching.unmatchedHead.flatMap(unit => {
    const ambiguous = matching.ambiguous.includes(unit);
    const extractionPossible = unit.kind !== 'file' && base.some(old => old.kind === unit.kind);
    if (!ambiguous && !extractionPossible) return [];
    return [{ kind: ambiguous ? 'ratchet-identity' : 'extracted-debt', path: unit.path,
      unitId: unit.unitId, identity: unit.identity,
      reason: ambiguous ? 'Multiple whole-unit matches remain; no old unit was reused.' :
        'Token-overlap extraction credit is unimplemented pending measured calibration.' }];
  });
  return { complete: unverified.length === 0, unverified };
}
