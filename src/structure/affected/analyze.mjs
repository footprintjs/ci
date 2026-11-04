export function affectedTests(head, base = null) {
  return { headId: head.id ?? null, baseId: base?.id ?? null, changedPaths: [], tests: [], alwaysRun: [], reasons: [],
    estimate: true, compilerRequired: false, compilerOnly: false, fullSuiteBeforeMerge: true,
    coverage: { complete: false, unverified: [] } };
}
