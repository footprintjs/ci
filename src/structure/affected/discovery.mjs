import { codePath, testPath } from '../sources/paths.mjs';
import { runnableTest } from './changes.mjs';
import { runnerInclude } from './runner.mjs';
import { literalGlob } from './glob.mjs';
import { setupRoots } from './setup-roots.mjs';

export function discoverTests(files, parsed) {
  const runner = runnerInclude(parsed);
  const patterns = runner.include?.map(literalGlob);
  const setups = setupRoots(runner, files);
  const reason = runner.reason ?? setups.reason ?? (patterns?.some(pattern => !pattern) ? 'Runner include uses unsupported glob syntax.' : null);
  if (reason) return { tests: [...files.keys()].filter(runnableTest).sort(),
    discovery: { mode: 'unverified', configPaths: runner.paths, setupPaths: [], notes: [] },
    unverified: [{ kind: 'affected-test-discovery', path: runner.paths[0] ?? 'vitest.config', line: 1, reason }] };
  const tests = [...files.keys()].filter(path => codePath(path) && patterns.some(pattern => pattern.test(path))).sort();
  const notes = [...parsed.keys()].filter(path => testPath(path) && !tests.includes(path)).map(path =>
    ({ path, reason: 'Outside the proven literal runner include; retained as a dependency if imported.' }));
  return { tests, discovery: { mode: 'literal-include', configPaths: runner.paths, include: runner.include,
    setupPaths: setups.paths, notes }, unverified: [] };
}
