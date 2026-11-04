import { testDependencies } from './dependencies.mjs';

function roots(context) {
  return (context.discovery?.setupPaths ?? []).map(path => testDependencies(context, path));
}

/** Shared setup is executed by the runner even when tests do not import it. */
export function sharedSetupImpact(head, base, change) {
  const dependencies = [...roots(head), ...roots(base)];
  const unverified = dependencies.flatMap(item => item.unverified);
  const reasons = [];
  for (const path of change.runtime) {
    if (dependencies.some(item => item.paths.has(path))) reasons.push({ changed: path, kind: 'shared-setup-dependency',
      reason: 'A configured shared setup closure contains this changed source.' });
  }
  const alwaysRun = change.paths.length > 0 && dependencies.some(item => item.reader || item.processLoader);
  if (alwaysRun) reasons.push({ changed: null, kind: 'shared-setup-always-run',
    reason: 'Configured shared setup reads files or executes opaque processes/workers.' });
  if (change.paths.length && unverified.length) reasons.push({ changed: null, kind: 'shared-setup-unknown',
    reason: 'Configured shared setup has unresolved runtime ownership.' });
  return { reasons, alwaysRun, unverified };
}
