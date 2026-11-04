import { testDependencies } from './dependencies.mjs';
import { sharedSetupImpact } from './shared-setup.mjs';

function reason(test, changed, kind, text) {
  return { test, changed, kind, reason: text };
}

function alwaysRunDependency(current, previous) {
  return current.reader || previous.reader || current.processLoader || previous.processLoader;
}

function includeSharedSetup(test, shared, selection) {
  if (shared.reasons.length) selection.selected.add(test);
  if (shared.alwaysRun) selection.alwaysRun.add(test);
  selection.reasons.push(...shared.reasons.map(item => ({ ...item, test })));
}

export function selectTests(head, base, change) {
  const selected = new Set();
  const alwaysRun = new Set();
  const reasons = [];
  const shared = sharedSetupImpact(head, base, change);
  const unverified = [...shared.unverified];
  for (const test of head.tests) {
    includeSharedSetup(test, shared, { selected, alwaysRun, reasons });
    const current = testDependencies(head, test);
    const previous = base.files.has(test) ? testDependencies(base, test) : { paths: new Set(), reader: false, unverified: [] };
    unverified.push(...current.unverified, ...previous.unverified);
    if (change.full.length) {
      selected.add(test);
      reasons.push(reason(test, change.full[0], 'whole-suite', 'Configuration, package, helper, setup, executable mode, uncertain discovery or missing base selects all known tests.'));
    }
    if (change.paths.includes(test)) {
      selected.add(test);
      reasons.push(reason(test, test, 'changed-test', 'A new or modified head test selects itself.'));
    }
    if (change.paths.length && alwaysRunDependency(current, previous)) {
      selected.add(test); alwaysRun.add(test);
      reasons.push(reason(test, null, 'always-run', 'Filesystem, path, folder-scan or opaque process/worker dependency keeps this test in the always-run set.'));
    }
    for (const path of change.runtime) {
      if (!current.paths.has(path) && !previous.paths.has(path)) continue;
      selected.add(test);
      reasons.push(reason(test, path, 'runtime-dependency', 'The head or base owner-followed runtime closure contains this changed path.'));
    }
    if (change.paths.length && (current.unverified.length || previous.unverified.length)) {
      selected.add(test);
      reasons.push(reason(test, null, 'conservative-unknown', 'Unresolved runtime ownership cannot exclude this test.'));
    }
  }
  for (const path of change.paths.filter(path => base.tests.includes(path) && !head.files.has(path))) {
    reasons.push(reason(null, path, 'deleted-test', 'Deleted test is recorded but is not a runnable head test.'));
  }
  return { tests: [...selected].sort(), alwaysRun: [...alwaysRun].sort(), reasons, unverified };
}
