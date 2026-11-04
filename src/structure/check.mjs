/** Expanded-rule red checkpoint; this report cannot claim complete coverage. */
export function checkStructure(_head, _base = null) {
  return { findings: [], coverage: { complete: false, unverified: [{ kind: 'checker-skeleton' }] },
    historicalReferences: [], loads: [] };
}
