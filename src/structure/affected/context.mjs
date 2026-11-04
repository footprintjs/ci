import ts from 'typescript';
import { trackedFiles, codePath, testPath } from '../sources/paths.mjs';
import { parseSource } from '../syntax/parse.mjs';
import { moduleInfo } from './modules.mjs';
import { runnableTest, wholeSuiteInput } from './changes.mjs';

function declaredPackages(files) {
  const text = files.get('package.json')?.text;
  if (!text) return new Set();
  const manifest = JSON.parse(text);
  return new Set(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .flatMap(key => Object.keys(manifest[key] ?? {})));
}

export function snapshotContext(snapshot) {
  const files = trackedFiles(snapshot ?? { files: [] });
  const parsed = new Map([...files].filter(([path]) => codePath(path))
    .map(([path, file]) => [path, parseSource(file)]));
  const unverified = [...parsed.values()].flatMap(source => source.sourceFile.parseDiagnostics.map(item => ({
    kind: 'parse-error', path: source.path,
    line: source.sourceFile.getLineAndCharacterOfPosition(item.start ?? 0).line + 1,
    reason: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  })));
  for (const path of parsed.keys()) {
    if (testPath(path) && !runnableTest(path) && !wholeSuiteInput(path) && !/\.d\.[cm]?ts$/.test(path)) {
      unverified.push({ kind: 'affected-test-discovery', path, line: 1,
        reason: 'Code in a test directory lacks the admitted test/spec suffix; runner configuration is not evaluated.' });
    }
  }
  const context = { files, parsed, packages: declaredPackages(files), unverified };
  const modules = new Map([...parsed].map(([path, source]) => [path, moduleInfo(source, context)]));
  return { ...context, modules, tests: [...files.keys()].filter(runnableTest).sort() };
}
