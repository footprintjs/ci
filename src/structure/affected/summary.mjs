export function selectionSummary(selected, knownTests) {
  const selectedTests = new Set(selected.tests);
  const groups = new Map();
  for (const item of selected.reasons) {
    if (!selectedTests.has(item.test)) continue;
    if (!groups.has(item.kind)) groups.set(item.kind, new Set());
    groups.get(item.kind).add(item.test);
  }
  return { selected: selectedTests.size, known: new Set(knownTests).size,
    byReason: Object.fromEntries([...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([kind, tests]) => [kind, tests.size])) };
}
