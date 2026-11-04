import { snapshotContext } from './context.mjs';
import { changedPaths, wholeSuiteInput, compilerChange, erasedSource, executableChange } from './changes.mjs';
import { selectTests } from './selection.mjs';
import { selectionSummary } from './summary.mjs';

function unique(items) {
  return [...new Map(items.map(item => [JSON.stringify(item), item])).values()]
    .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
}

function erasedPath(path, head, base) {
  return /\.[cm]?tsx?$/.test(path) && (head.parsed.has(path) || base.parsed.has(path))
    && erasedSource(head.parsed.get(path)) && erasedSource(base.parsed.get(path));
}

/** Static estimate only; no selected set replaces the required full suite. */
export function affectedTests(headSnapshot, baseSnapshot = null) {
  const head = snapshotContext(headSnapshot);
  const base = snapshotContext(baseSnapshot);
  const paths = changedPaths(head.files, base.files);
  const full = baseSnapshot ? paths.filter(path => wholeSuiteInput(path) || executableChange(path, head.files, base.files)) : ['<missing-base>'];
  if (paths.length && [...head.unverified, ...base.unverified].some(item => item.kind === 'affected-test-discovery')) {
    full.push('<unverified-test-discovery>');
  }
  const runtime = paths.filter(path => !erasedPath(path, head, base));
  const selected = selectTests(head, base, { paths, full, runtime });
  const unverified = unique([...head.unverified, ...base.unverified, ...selected.unverified]);
  const compilerRequired = !baseSnapshot || full.length > 0 || paths.some(compilerChange);
  return { selection: selectionSummary(selected, head.tests), headId: headSnapshot.id ?? null, baseId: baseSnapshot?.id ?? null,
    changedPaths: paths, tests: selected.tests, alwaysRun: selected.alwaysRun, reasons: unique(selected.reasons),
    estimate: true, compilerRequired,
    compilerOnly: compilerRequired && !selected.tests.length && !runtime.length && paths.length > 0 && !unverified.length,
    fullSuiteBeforeMerge: true, coverage: { complete: unverified.length === 0, unverified }, discovery: head.discovery };
}
